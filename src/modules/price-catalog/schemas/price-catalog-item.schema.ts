import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type PriceCatalogItemDocument = HydratedDocument<PriceCatalogItem>;

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class PriceCatalogItem extends BaseEntity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, default: 0 })
  price: number;

  @Prop()
  category?: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const PriceCatalogItemSchema = SchemaFactory.createForClass(PriceCatalogItem);

PriceCatalogItemSchema.index({ clinicId: 1, deletedAt: 1 });
PriceCatalogItemSchema.index({ clinicId: 1, category: 1, deletedAt: 1 });
