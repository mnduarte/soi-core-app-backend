import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type GallerySessionDocument = HydratedDocument<GallerySession>;

// Categoría de la foto. Es un string libre porque cada consultorio la
// personaliza (ClinicSettings.photoCategories); los defaults del front son
// Intraoral / Extraoral / Radiografía.
export const DEFAULT_PHOTO_CATEGORIES = ['Intraoral', 'Extraoral', 'Radiografía'];

export class GalleryPhoto {
  @Prop({ type: Types.ObjectId, auto: true })
  _id: Types.ObjectId;

  @Prop({ required: true })
  publicId: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop({ type: String, default: DEFAULT_PHOTO_CATEGORIES[0] })
  type: string;

  @Prop()
  caption?: string;

  @Prop()
  description?: string;

  // Movimiento (cuenta corriente) al que se vincula la foto, si se subió
  // desde una fila/movimiento de la ficha. Opcional.
  @Prop({ type: Types.ObjectId, ref: 'Transaction' })
  transactionId?: Types.ObjectId;

  @Prop()
  toothNumber?: number;

  @Prop({ required: true })
  uploadedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;
}

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class GallerySession extends BaseEntity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Patient' })
  patientId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  notes?: string;

  @Prop({ type: [Object], default: [] })
  photos: GalleryPhoto[];
}

export const GallerySessionSchema = SchemaFactory.createForClass(GallerySession);

GallerySessionSchema.index({ clinicId: 1, patientId: 1, deletedAt: 1 });
