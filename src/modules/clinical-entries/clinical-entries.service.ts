import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ClinicalEntry, ClinicalEntryDocument } from './schemas/clinical-entry.schema';
import {
  Appointment,
  AppointmentDocument,
  FichaStatus,
} from '../appointments/schemas/appointment.schema';
import { CreateClinicalEntryDto } from './dto/create-clinical-entry.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ClinicalEntriesService {
  constructor(
    @InjectModel(ClinicalEntry.name) private entryModel: Model<ClinicalEntryDocument>,
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
  ) {}

  async create(clinicId: string, patientId: string, dto: CreateClinicalEntryDto, requester: JwtPayload) {
    // Si la entrada documenta un turno, validamos que el turno pertenezca a
    // esta clínica y a este paciente antes de enlazarlo (aislamiento tenant).
    let appointmentId: Types.ObjectId | undefined;
    if (dto.appointmentId) {
      const appointment = await this.appointmentModel
        .findOne({
          _id: new Types.ObjectId(dto.appointmentId),
          clinicId: new Types.ObjectId(clinicId),
          patientId: new Types.ObjectId(patientId),
          deletedAt: null,
        })
        .exec();
      if (!appointment) {
        throw new NotFoundException('Turno no encontrado para este paciente');
      }
      appointmentId = appointment._id as Types.ObjectId;
    }

    const entry = await this.entryModel.create({
      ...dto,
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(patientId),
      appointmentId,
      professionalId: dto.professionalId ? new Types.ObjectId(dto.professionalId) : new Types.ObjectId(requester.sub),
      correctedEntryId: dto.correctedEntryId ? new Types.ObjectId(dto.correctedEntryId) : undefined,
      createdBy: new Types.ObjectId(requester.sub),
    });

    // Cierra el círculo turno↔ficha↔evolución: documentar la visita apaga el
    // badge "ficha pendiente" del turno que la originó.
    if (appointmentId) {
      await this.appointmentModel
        .updateOne(
          { _id: appointmentId, clinicId: new Types.ObjectId(clinicId) },
          {
            ficha: FichaStatus.DONE,
            updatedAt: new Date(),
            updatedBy: new Types.ObjectId(requester.sub),
          },
        )
        .exec();
    }

    return entry;
  }

  async findAll(clinicId: string, patientId: string) {
    return this.entryModel
      .find({
        clinicId: new Types.ObjectId(clinicId),
        patientId: new Types.ObjectId(patientId),
        deletedAt: null,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(clinicId: string, entryId: string) {
    const entry = await this.entryModel
      .findOne({
        _id: new Types.ObjectId(entryId),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .exec();
    if (!entry) throw new NotFoundException('Entrada clínica no encontrada');
    return entry;
  }

  async update(clinicId: string, entryId: string, content: string, requester: JwtPayload) {
    const entry = await this.findById(clinicId, entryId);

    const ageMs = Date.now() - entry.createdAt.getTime();
    if (ageMs > EDIT_WINDOW_MS) {
      throw new ForbiddenException('Las entradas clínicas solo se pueden editar dentro de las 24 horas de su creación');
    }

    entry.editHistory.push({
      editedAt: new Date(),
      editedBy: new Types.ObjectId(requester.sub),
      previousContent: entry.content,
    });

    entry.content = content;
    entry.updatedAt = new Date();
    entry.updatedBy = new Types.ObjectId(requester.sub);
    entry.markModified('editHistory');
    return entry.save();
  }

  async softDelete(clinicId: string, entryId: string, requester: JwtPayload) {
    const entry = await this.findById(clinicId, entryId);

    const ageMs = Date.now() - entry.createdAt.getTime();
    if (ageMs > EDIT_WINDOW_MS) {
      throw new ForbiddenException('Las entradas clínicas solo se pueden eliminar dentro de las 24 horas de su creación');
    }

    entry.deletedAt = new Date();
    entry.deletedBy = new Types.ObjectId(requester.sub);
    return entry.save();
  }
}
