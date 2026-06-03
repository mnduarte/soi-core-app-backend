import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type GallerySessionDocument = HydratedDocument<GallerySession>;

export class GalleryPhoto {
  @Prop({ type: Types.ObjectId, auto: true })
  _id: Types.ObjectId;

  @Prop({ required: true })
  publicId: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop()
  caption?: string;

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
