import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clinic, ClinicDocument } from './schemas/clinic.schema';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class ClinicsService {
  constructor(
    @InjectModel(Clinic.name) private clinicModel: Model<ClinicDocument>,
  ) {}

  async findById(id: string): Promise<ClinicDocument> {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(id), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Consultorio no encontrado');
    return clinic;
  }

  async updateClinic(clinicId: string, dto: UpdateClinicDto): Promise<ClinicDocument> {
    const clinic = await this.findById(clinicId);
    Object.assign(clinic, dto);
    clinic.updatedAt = new Date();
    return clinic.save();
  }

  async getSettings(clinicId: string) {
    const clinic = await this.findById(clinicId);
    return clinic.settings;
  }

  async updateSettings(clinicId: string, dto: UpdateSettingsDto): Promise<ClinicDocument> {
    const clinic = await this.findById(clinicId);
    const settings = clinic.settings ?? {};

    if (dto.timezone !== undefined) settings.timezone = dto.timezone;
    if (dto.appointmentDurationDefault !== undefined)
      settings.appointmentDurationDefault = dto.appointmentDurationDefault;
    if (dto.allowOverlappingAppointments !== undefined)
      settings.allowOverlappingAppointments = dto.allowOverlappingAppointments;
    if (dto.workingHours !== undefined) settings.workingHours = dto.workingHours;
    if (dto.whatsappTemplate !== undefined)
      settings.reminderTemplates = { whatsapp: dto.whatsappTemplate };

    clinic.settings = settings;
    clinic.updatedAt = new Date();
    return clinic.save();
  }
}
