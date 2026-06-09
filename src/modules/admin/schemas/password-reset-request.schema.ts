import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PasswordResetRequestDocument = PasswordResetRequest & Document;

// One row per "olvidé mi contraseña" submission from a user. The super-admin
// works through these from the BO inbox — clicking "Resetear y avisar" calls
// adminService.resetCredentials() and marks the row resolved.
@Schema({ collection: 'password_reset_requests', timestamps: true })
export class PasswordResetRequest {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  // Verbatim identifier the user typed (username or email). Stored mostly so
  // the BO can show "matias.duarte" in the inbox even if the user record has
  // a different display field.
  @Prop({ required: true })
  identifier: string;

  // Free-text "qué pasó" the user can optionally add ("me bloquearon", "no
  // recuerdo cuál puse"). Capped at 280 chars to fit nicely in the BO row.
  @Prop({ maxlength: 280 })
  note?: string;

  @Prop({ default: () => new Date() })
  requestedAt: Date;

  @Prop()
  resolvedAt?: Date;

  // AdminUser id of whoever closed it. Optional because future automation
  // (auto-resolve on resetCredentials triggered by a different admin) still
  // needs a sensible default.
  @Prop({ type: Types.ObjectId })
  resolvedBy?: Types.ObjectId;
}

export const PasswordResetRequestSchema =
  SchemaFactory.createForClass(PasswordResetRequest);

// Pending requests are looked up constantly (badge count + drawer list); the
// resolved ones are mostly cold storage for audit. Indexing the open state
// keeps the hot query cheap.
PasswordResetRequestSchema.index({ resolvedAt: 1, requestedAt: -1 });
PasswordResetRequestSchema.index({ clinicId: 1, resolvedAt: 1 });
