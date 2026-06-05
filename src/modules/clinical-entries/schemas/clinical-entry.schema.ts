import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type ClinicalEntryDocument = HydratedDocument<ClinicalEntry>;

// Categoría de la entrada de evolución. Alimenta los filtros y el timeline del
// historial. Una entrada generada al documentar un turno suele ser TREATMENT o
// CONTROL; las auto-generadas (foto, radiografía) usan PHOTO.
export enum ClinicalEntryType {
  TREATMENT = 'TREATMENT',
  CONTROL = 'CONTROL',
  PHOTO = 'PHOTO',
  NOTE = 'NOTE',
}

export class EditRecord {
  @Prop({ required: true })
  editedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  editedBy: Types.ObjectId;

  @Prop({ required: true })
  previousContent: string;
}

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class ClinicalEntry extends BaseEntity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Patient' })
  patientId: Types.ObjectId;

  // Turno que originó esta entrada. Opcional: las entradas manuales o las
  // auto-generadas (foto/plan) no nacen de un turno. Es el único vínculo entre
  // turno y evolución — el turno no guarda texto clínico propio.
  @Prop({ type: Types.ObjectId, ref: 'Appointment' })
  appointmentId?: Types.ObjectId;

  @Prop({ type: String, enum: ClinicalEntryType, default: ClinicalEntryType.NOTE })
  type: ClinicalEntryType;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  professionalId?: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop()
  toothNumber?: number;

  @Prop()
  procedure?: string;

  @Prop({ type: [Object], default: [] })
  editHistory: EditRecord[];

  @Prop({ default: false })
  isCorrection: boolean;

  @Prop({ type: Types.ObjectId, ref: 'ClinicalEntry' })
  correctedEntryId?: Types.ObjectId;
}

export const ClinicalEntrySchema = SchemaFactory.createForClass(ClinicalEntry);

ClinicalEntrySchema.index({ clinicId: 1, patientId: 1, deletedAt: 1 });
ClinicalEntrySchema.index({ clinicId: 1, patientId: 1, createdAt: -1 });
// Para resolver "¿este turno ya tiene evolución?" y enlazar turno → entrada.
ClinicalEntrySchema.index({ clinicId: 1, appointmentId: 1 });
