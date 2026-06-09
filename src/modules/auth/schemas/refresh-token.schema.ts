import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RefreshTokenDocument = RefreshToken & Document;

@Schema({ collection: 'refresh_tokens' })
export class RefreshToken {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt?: Date;

  // Why this token was revoked. Lets the refresh handler tell apart
  // "session ended cleanly because user logged in elsewhere" from
  // "this looks like a stolen-token replay" — the second one nukes
  // every active session for the user; the first one does not.
  @Prop({
    type: String,
    enum: ['ROTATED', 'LOGOUT', 'SESSION_REPLACED'],
    default: null,
  })
  revokeReason?: 'ROTATED' | 'LOGOUT' | 'SESSION_REPLACED' | null;

  @Prop({ type: Types.ObjectId })
  replacedByTokenId?: Types.ObjectId;

  @Prop()
  userAgent?: string;

  @Prop()
  ipAddress?: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

RefreshTokenSchema.index({ userId: 1 });
// TTL index: MongoDB auto-removes expired tokens
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
