import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type UserDocument = User & Document;

export enum UserRole {
  OWNER = 'OWNER',
  MEMBER = 'MEMBER',
}

// Honorific shown before the name in the UI (login greeting + sidebar).
// ASSISTANT → no prefix. Set per user from the backoffice.
export enum UserTitle {
  DR = 'DR',
  DRA = 'DRA',
  NONE = 'NONE',
}

export class ClinicalProfile {
  @Prop()
  license?: string;

  @Prop()
  specialty?: string;

  @Prop()
  agendaColor?: string;
}

@Schema({ collection: 'users', timestamps: true })
export class User extends BaseEntity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  // Username for clinic-scoped login (typically === clinic.slug for OWNER
  // users created from the backoffice). Optional because legacy users
  // created via invitation flow only have email.
  @Prop({ lowercase: true, trim: true })
  username?: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  name: string;

  @Prop({ enum: UserTitle, default: UserTitle.NONE })
  title: UserTitle;

  @Prop({ enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @Prop({ default: false })
  isClinical: boolean;

  @Prop({ type: Object })
  clinicalProfile?: ClinicalProfile;

  @Prop()
  lastLoginAt?: Date;

  // Set to true when an admin creates the account or resets credentials.
  // Forces the user through a "create your password" flow on first login.
  @Prop({ default: false })
  mustChangePassword: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  { clinicId: 1, email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
UserSchema.index(
  { clinicId: 1, username: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, username: { $type: 'string' } },
  },
);
UserSchema.index({ clinicId: 1, isClinical: 1 });
