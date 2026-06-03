import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type ClinicalEntryDocument = HydratedDocument<ClinicalEntry>;

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
