import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type WorkDocument = HydratedDocument<Work>;

// Estado de un trabajo. Mismos valores que el viejo `TreatmentItemStatus` (la
// migración los preserva 1:1). PROPOSED/SCHEDULED/IN_PROGRESS/RECURRENT = "por
// hacer" (plan de tratamiento); COMPLETED = hecho (suma a cobrar, queda en el
// historial); CANCELLED = descartado (no cuenta ni como pendiente ni hecho).
export enum WorkStatus {
  PROPOSED = 'PROPOSED',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  RECURRENT = 'RECURRENT',
  CANCELLED = 'CANCELLED',
}

// Un trabajo odontológico como documento plano (colección propia). Reemplaza a
// los ítems embebidos en `TreatmentPlan.items`: así el historial de hechos —que
// escala a miles por paciente en años— se busca y pagina server-side, sin tope
// de 16MB por documento. La foto se vincula por `GalleryPhoto.treatmentItemId`
// (== este `_id`), por eso la migración preserva el `_id` original.
@Schema()
export class Work extends BaseEntity {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  clinicId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  patientId: Types.ObjectId;

  @Prop({ required: true })
  description: string;

  // Texto libre: un diente (FDI), varios ("16, 24") o un grupo. No se valida.
  @Prop()
  toothNumber?: string;

  @Prop()
  surface?: string;

  @Prop({ default: 0 })
  price: number;

  @Prop({ default: WorkStatus.PROPOSED, enum: WorkStatus })
  status: WorkStatus;

  // Fecha en que se marcó hecho (la sella el backend, no el cliente). Solo si
  // COMPLETED; se limpia al volver a pendiente.
  @Prop()
  completedAt?: Date;

  // Fecha tentativa en que se espera hacerlo (para los pendientes del plan).
  @Prop()
  estimatedDate?: Date;

  @Prop()
  notes?: string;
}

export const WorkSchema = SchemaFactory.createForClass(Work);
// Pendientes/hechos por paciente + orden del historial por fecha de realización.
WorkSchema.index({ clinicId: 1, patientId: 1, status: 1, deletedAt: 1 });
WorkSchema.index({ clinicId: 1, patientId: 1, completedAt: -1 });
