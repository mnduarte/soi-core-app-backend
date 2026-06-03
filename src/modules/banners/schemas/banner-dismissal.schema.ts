import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BannerDismissalDocument = HydratedDocument<BannerDismissal>;

@Schema()
export class BannerDismissal {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Banner' })
  bannerId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, default: () => new Date() })
  dismissedAt: Date;
}

export const BannerDismissalSchema = SchemaFactory.createForClass(BannerDismissal);

BannerDismissalSchema.index({ bannerId: 1, userId: 1 }, { unique: true });
