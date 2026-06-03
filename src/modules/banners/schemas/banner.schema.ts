import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BannerDocument = HydratedDocument<Banner>;

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Banner {
  @Prop({ required: true })
  title: string;

  @Prop()
  body?: string;

  @Prop()
  ctaLabel?: string;

  @Prop()
  ctaUrl?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  startsAt?: Date;

  @Prop()
  endsAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const BannerSchema = SchemaFactory.createForClass(Banner);

BannerSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });
