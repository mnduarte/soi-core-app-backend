import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Appointment, AppointmentDocument, AppointmentStatus, FichaStatus } from './schemas/appointment.schema';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/create-appointment.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { InjectModel as InjectClinicModel } from '@nestjs/mongoose';
import { Clinic, ClinicDocument } from '../clinics/schemas/clinic.schema';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    @InjectClinicModel(Clinic.name) private clinicModel: Model<ClinicDocument>,
  ) {}

  private async checkOverlap(clinicId: string, startsAt: Date, endsAt: Date, excludeId?: string) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .select('settings')
      .exec();

    if (clinic?.settings?.allowOverlappingAppointments) return;

    const filter: Record<string, unknown> = {
      clinicId: new Types.ObjectId(clinicId),
      deletedAt: null,
      status: { $nin: ['CANCELLED', 'NO_SHOW'] },
      startsAt: { $lt: endsAt },
      endsAt: { $gt: startsAt },
    };

    if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId) };

    const overlap = await this.appointmentModel.findOne(filter).exec();
    if (overlap) {
      throw new ConflictException('Ya existe un turno en ese horario');
    }
  }

  async create(clinicId: string, dto: CreateAppointmentDto, requester: JwtPayload) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    await this.checkOverlap(clinicId, startsAt, endsAt);

    return this.appointmentModel.create({
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(dto.patientId),
      professionalId: dto.professionalId ? new Types.ObjectId(dto.professionalId) : undefined,
      startsAt,
      endsAt,
      title: dto.title,
      notes: dto.notes,
      createdBy: new Types.ObjectId(requester.sub),
    });
  }

  async findAll(clinicId: string, from?: string, to?: string, patientId?: string) {
    const filter: Record<string, unknown> = {
      clinicId: new Types.ObjectId(clinicId),
      deletedAt: null,
    };

    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.$gte = new Date(from);
      if (to) dateFilter.$lte = new Date(to);
      filter.startsAt = dateFilter;
    }

    if (patientId) filter.patientId = new Types.ObjectId(patientId);

    return this.appointmentModel.find(filter).sort({ startsAt: 1 }).exec();
  }

  async findById(clinicId: string, appointmentId: string) {
    const appointment = await this.appointmentModel
      .findOne({
        _id: new Types.ObjectId(appointmentId),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .exec();
    if (!appointment) throw new NotFoundException('Turno no encontrado');
    return appointment;
  }

  async update(clinicId: string, appointmentId: string, dto: UpdateAppointmentDto, requester: JwtPayload) {
    const appointment = await this.findById(clinicId, appointmentId);

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : appointment.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : appointment.endsAt;

    if (dto.startsAt || dto.endsAt) {
      await this.checkOverlap(clinicId, startsAt, endsAt, appointmentId);
    }

    Object.assign(appointment, {
      ...dto,
      startsAt,
      endsAt,
      professionalId: dto.professionalId ? new Types.ObjectId(dto.professionalId) : appointment.professionalId,
    });

    // Ficha lifecycle is coupled to status transitions:
    //   COMPLETED → ficha starts PENDING (unless caller already passed DONE),
    //               so "atendido sin documentar" stays visible until the ficha
    //               is actually saved.
    //   NO_SHOW / CANCELLED → no ficha exists for this visit; clear it.
    // We only override when the caller didn't explicitly set `ficha` in the DTO.
    if (dto.status && dto.ficha === undefined) {
      if (dto.status === AppointmentStatus.COMPLETED && !appointment.ficha) {
        appointment.ficha = FichaStatus.PENDING;
      } else if (
        dto.status === AppointmentStatus.NO_SHOW ||
        dto.status === AppointmentStatus.CANCELLED
      ) {
        appointment.ficha = null;
      }
    }

    appointment.updatedAt = new Date();
    appointment.updatedBy = new Types.ObjectId(requester.sub);
    return appointment.save();
  }

  async markReminderSent(clinicId: string, appointmentId: string) {
    const appointment = await this.findById(clinicId, appointmentId);
    appointment.reminderSent = true;
    appointment.reminderSentAt = new Date();
    return appointment.save();
  }

  async softDelete(clinicId: string, appointmentId: string, requester: JwtPayload) {
    const appointment = await this.findById(clinicId, appointmentId);
    appointment.deletedAt = new Date();
    appointment.deletedBy = new Types.ObjectId(requester.sub);
    return appointment.save();
  }
}
