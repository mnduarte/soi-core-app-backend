import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TreatmentItem,
  TreatmentItemStatus,
  TreatmentPlan,
  TreatmentPlanDocument,
} from './schemas/treatment-plan.schema';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import {
  AddTreatmentItemDto,
  UpdateTreatmentItemDto,
  UpdateTreatmentPlanDto,
} from './dto/update-treatment-plan.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class TreatmentPlansService {
  constructor(
    @InjectModel(TreatmentPlan.name)
    private planModel: Model<TreatmentPlanDocument>,
  ) {}

  async create(
    clinicId: string,
    patientId: string,
    dto: CreateTreatmentPlanDto,
    requester: JwtPayload,
  ) {
    // Items arrive with ISO-string dates; the schema stores Date. Coerce before
    // handing it to Mongoose so the cast doesn't silently produce undefined.
    const items = (dto.items ?? []).map((it) => ({
      ...it,
      estimatedDate: it.estimatedDate ? new Date(it.estimatedDate) : undefined,
    }));
    return this.planModel.create({
      title: dto.title,
      notes: dto.notes,
      items,
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(patientId),
      createdBy: new Types.ObjectId(requester.sub),
    });
  }

  async findAll(clinicId: string, patientId: string) {
    return this.planModel
      .find({
        clinicId: new Types.ObjectId(clinicId),
        patientId: new Types.ObjectId(patientId),
        deletedAt: null,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(clinicId: string, planId: string) {
    const plan = await this.planModel
      .findOne({
        _id: new Types.ObjectId(planId),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .exec();
    if (!plan) throw new NotFoundException('Plan de tratamiento no encontrado');
    return plan;
  }

  async update(
    clinicId: string,
    planId: string,
    dto: UpdateTreatmentPlanDto,
    requester: JwtPayload,
  ) {
    const plan = await this.findById(clinicId, planId);
    Object.assign(plan, dto);
    plan.updatedAt = new Date();
    plan.updatedBy = new Types.ObjectId(requester.sub);
    return plan.save();
  }

  async updateItem(
    clinicId: string,
    planId: string,
    itemId: string,
    dto: UpdateTreatmentItemDto,
    requester: JwtPayload,
  ) {
    const plan = await this.findById(clinicId, planId);
    const item = plan.items.find((i) => i._id.toString() === itemId);
    if (!item) throw new NotFoundException('Item no encontrado');

    // Modelo "Falta cobrar": completar un trabajo NO genera un cargo. La deuda
    // se calcula en vivo como (Σ precio de trabajos hechos − Σ pagos); marcar
    // "hecho" es progreso clínico y no toca la plata por sí solo.
    //
    // OJO: NO usar `Object.assign(item, { ...dto })`. Con `transform: true`, el
    // DTO de class-validator es una instancia con TODAS las opcionales presentes
    // como `undefined` (exposeUnsetFields). Un spread pisaría description/price
    // con undefined → se guardan como null (bug de "(sin nombre)" al tildar).
    // Por eso asignamos SOLO los campos realmente enviados.
    const wasComplete = item.status === TreatmentItemStatus.COMPLETED;
    if (dto.description !== undefined) item.description = dto.description;
    if (dto.toothNumber !== undefined) item.toothNumber = dto.toothNumber;
    if (dto.surface !== undefined) item.surface = dto.surface;
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.price !== undefined) item.price = dto.price;
    if (dto.notes !== undefined) item.notes = dto.notes;
    if (dto.estimatedDate !== undefined)
      item.estimatedDate = new Date(dto.estimatedDate);

    // Sellamos/limpiamos la fecha de realización según la transición de estado:
    // al pasar a hecho la guardamos (una sola vez), al volver a pendiente la
    // borramos. La fecha la maneja el servidor, no el cliente.
    if (dto.status !== undefined) {
      const isComplete = dto.status === TreatmentItemStatus.COMPLETED;
      if (isComplete && !wasComplete) item.completedAt = new Date();
      else if (!isComplete && wasComplete) item.completedAt = undefined;
    }

    plan.updatedAt = new Date();
    plan.updatedBy = new Types.ObjectId(requester.sub);
    plan.markModified('items');
    return plan.save();
  }

  // Append a single item — the typical "Agregar al plan" flow. If the patient
  // has no plan yet, this auto-creates one called "Plan general"; otherwise it
  // appends to the most recent plan. The frontend treats a patient as having
  // a single ongoing plan, so this matches that mental model.
  async addItem(
    clinicId: string,
    patientId: string,
    dto: AddTreatmentItemDto,
    requester: JwtPayload,
  ) {
    const plans = await this.findAll(clinicId, patientId);
    let plan: TreatmentPlanDocument;
    if (plans.length === 0) {
      plan = await this.planModel.create({
        clinicId: new Types.ObjectId(clinicId),
        patientId: new Types.ObjectId(patientId),
        title: 'Plan general',
        items: [],
        createdBy: new Types.ObjectId(requester.sub),
      });
    } else {
      plan = plans[0];
    }

    const item: Partial<TreatmentItem> = {
      _id: new Types.ObjectId(),
      description: dto.description,
      toothNumber: dto.toothNumber,
      surface: dto.surface,
      status: dto.status ?? TreatmentItemStatus.PROPOSED,
      estimatedDate: dto.estimatedDate
        ? new Date(dto.estimatedDate)
        : undefined,
      // Si se agrega ya marcado como hecho, sellamos la fecha de realización.
      completedAt:
        dto.status === TreatmentItemStatus.COMPLETED ? new Date() : undefined,
      price: dto.price ?? 0,
      notes: dto.notes,
    };
    plan.items.push(item as TreatmentItem);
    plan.updatedAt = new Date();
    plan.updatedBy = new Types.ObjectId(requester.sub);
    plan.markModified('items');
    return plan.save();
  }

  async removeItem(
    clinicId: string,
    planId: string,
    itemId: string,
    requester: JwtPayload,
  ) {
    const plan = await this.findById(clinicId, planId);
    const before = plan.items.length;
    plan.items = plan.items.filter((i) => i._id.toString() !== itemId);
    if (plan.items.length === before)
      throw new NotFoundException('Item no encontrado');
    plan.updatedAt = new Date();
    plan.updatedBy = new Types.ObjectId(requester.sub);
    plan.markModified('items');
    return plan.save();
  }

  async softDelete(clinicId: string, planId: string, requester: JwtPayload) {
    const plan = await this.findById(clinicId, planId);
    plan.deletedAt = new Date();
    plan.deletedBy = new Types.ObjectId(requester.sub);
    return plan.save();
  }
}
