import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from '../../users/schemas/user.schema';

export type InvitationDocument = Invitation & Document;

@Schema({ collection: 'invitations' })
export class Invitation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true, lowercase: true })
  email: string;

  @Prop({ enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @Prop({ default: false })
  isClinical: boolean;

  @Prop({ required: true })
  token: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  acceptedAt?: Date;

  @Prop({ type: Date, default: null })
  revokedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const InvitationSchema = SchemaFactory.createForClass(Invitation);

InvitationSchema.index(
  { token: 1 },
  { unique: true, partialFilterExpression: { acceptedAt: null, revokedAt: null } },
);
InvitationSchema.index({ clinicId: 1, email: 1 });
