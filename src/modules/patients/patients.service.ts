import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Patient, PatientDocument } from './schemas/patient.schema';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { ScanFichaDto } from './dto/scan-ficha.dto';
import { FichaScanService } from './ficha-scan.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class PatientsService {
  constructor(
    @InjectModel(Patient.name) private patientModel: Model<PatientDocument>,
    private readonly fichaScan: FichaScanService,
  ) {}

  // Reads a paper record photo, returns the extracted fields plus a possible
  // existing patient match (by DNI → phone → name+lastName, scoped to the
  // clinic). Matches ACTIVE patients first; if none, looks among SOFT-DELETED
  // ones so the UI can offer to restore (with full history) instead of creating
  // a duplicate. `deleted` flags which case it is.
  async scanFicha(clinicId: string, dto: ScanFichaDto) {
    const extracted = await this.fichaScan.extract(dto.image, dto.mediaType);
    const cid = new Types.ObjectId(clinicId);

    const findMatch = async (q: Record<string, unknown>) => {
      const active = await this.patientModel
        .findOne({ clinicId: cid, ...q, deletedAt: null })
        .select('_id name lastName')
        .lean();
      if (active) return { ...active, deleted: false };
      const deleted = await this.patientModel
        .findOne({ clinicId: cid, ...q, deletedAt: { $ne: null } })
        .select('_id name lastName')
        .lean();
      if (deleted) return { ...deleted, deleted: true };
      return null;
    };

    let match: { _id: Types.ObjectId; name: string; lastName: string; deleted: boolean } | null = null;
    if (extracted.dni) match = await findMatch({ dni: extracted.dni });
    if (!match && extracted.phone) match = await findMatch({ phone: extracted.phone });
    if (!match && extracted.name && extracted.lastName) {
      match = await findMatch({
        name: new RegExp(`^${escapeRegex(extracted.name)}$`, 'i'),
        lastName: new RegExp(`^${escapeRegex(extracted.lastName)}$`, 'i'),
      });
    }

    return {
      extracted,
      existing: match
        ? {
            _id: match._id.toString(),
            name: match.name,
            lastName: match.lastName,
            deleted: match.deleted,
          }
        : null,
    };
  }

  // Revive a soft-deleted patient (keeps all its history). Looks it up without
  // the deletedAt:null filter on purpose.
  async restore(clinicId: string, patientId: string) {
    const patient = await this.patientModel
      .findOne({ _id: new Types.ObjectId(patientId), clinicId: new Types.ObjectId(clinicId) })
      .exec();
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    await this.patientModel
      .updateOne({ _id: patient._id }, { $unset: { deletedAt: '', deletedBy: '' } })
      .exec();
    return { ok: true };
  }

  async create(clinicId: string, dto: CreatePatientDto, requester: JwtPayload) {
    if (dto.dni) {
      const existing = await this.patientModel
        .findOne({ clinicId: new Types.ObjectId(clinicId), dni: dto.dni, deletedAt: null })
        .exec();
      if (existing) throw new ConflictException('Ya existe un paciente con ese DNI');
    }

    return this.patientModel.create({
      ...dto,
      clinicId: new Types.ObjectId(clinicId),
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      isActive: dto.isActive ?? true,
      createdBy: new Types.ObjectId(requester.sub),
    });
  }

  async findAll(clinicId: string, search?: string) {
    const filter: Record<string, unknown> = {
      clinicId: new Types.ObjectId(clinicId),
      deletedAt: null,
    };

    if (search?.trim()) {
      filter.$text = { $search: search.trim() };
    }

    return this.patientModel
      .find(filter)
      .sort(search ? { score: { $meta: 'textScore' } } : { lastName: 1, name: 1 })
      .exec();
  }

  async findById(clinicId: string, patientId: string) {
    const patient = await this.patientModel
      .findOne({
        _id: new Types.ObjectId(patientId),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .exec();
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return patient;
  }

  async update(clinicId: string, patientId: string, dto: UpdatePatientDto, requester: JwtPayload) {
    const patient = await this.findById(clinicId, patientId);

    if (dto.dni && dto.dni !== patient.dni) {
      const conflict = await this.patientModel
        .findOne({
          clinicId: new Types.ObjectId(clinicId),
          dni: dto.dni,
          deletedAt: null,
          _id: { $ne: new Types.ObjectId(patientId) },
        })
        .exec();
      if (conflict) throw new ConflictException('Ya existe un paciente con ese DNI');
    }

    Object.assign(patient, {
      ...dto,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : patient.birthDate,
    });
    patient.updatedAt = new Date();
    patient.updatedBy = new Types.ObjectId(requester.sub);
    return patient.save();
  }

  async softDelete(clinicId: string, patientId: string, requester: JwtPayload) {
    const patient = await this.findById(clinicId, patientId);
    patient.deletedAt = new Date();
    patient.deletedBy = new Types.ObjectId(requester.sub);
    return patient.save();
  }
}
