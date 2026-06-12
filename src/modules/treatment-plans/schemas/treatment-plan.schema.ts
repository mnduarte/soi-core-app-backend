import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type TreatmentPlanDocument = HydratedDocument<TreatmentPlan>;

// Lifecycle of a plan item, mirrors what the dentist tracks in practice:
//   PROPOSED    → just diagnosed, no turno yet (default)
//   SCHEDULED   → patient has an appointment for it
//   IN_PROGRESS → multi-session work that's started but not finished
//   COMPLETED   → done; usually flips the matching tooth mark from REQUIRED
//                 (azul) to EXISTING (rojo) in the odontograma
//   RECURRENT   → ongoing, doesn't terminate (brackets control mensual, etc.)
//   CANCELLED   → dropped
export enum TreatmentItemStatus {
  PROPOSED = 'PROPOSED',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  RECURRENT = 'RECURRENT',
  CANCELLED = 'CANCELLED',
}

export class TreatmentItem {
  @Prop({ type: Types.ObjectId, auto: true })
  _id: Types.ObjectId;

  @Prop({ required: true })
  description: string;

  // Free text: one tooth (FDI), several ("16, 24"), or a group
  // ("anterosuperiores"). Stored as a label, not validated as a number.
  @Prop()
  toothNumber?: string;

  @Prop()
  surface?: string;

  @Prop({ default: 0 })
  price: number;

  @Prop({ default: TreatmentItemStatus.PROPOSED, enum: TreatmentItemStatus })
  status: TreatmentItemStatus;

  // Cargo generado en la cuenta corriente al completar este ítem. Guardarlo
  // hace el cobro idempotente: re-completar no vuelve a cargar.
  @Prop({ type: Types.ObjectId, ref: 'Transaction' })
  chargeTransactionId?: Types.ObjectId;

  // Tentative date — when the dentist expects to schedule/do the work. Not the
  // same as the appointment's startsAt; this can exist before a turno is
  // generated. Stored as Date so we can sort and filter.
  @Prop()
  estimatedDate?: Date;

  @Prop()
  notes?: string;
}

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class TreatmentPlan extends BaseEntity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Patient' })
  patientId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  notes?: string;

  @Prop({ type: [Object], default: [] })
  items: TreatmentItem[];
}

export const TreatmentPlanSchema = SchemaFactory.createForClass(TreatmentPlan);

TreatmentPlanSchema.index({ clinicId: 1, patientId: 1, deletedAt: 1 });
