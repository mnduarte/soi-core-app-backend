import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type UserDocument = User & Document;

export enum UserRole {
  OWNER = 'OWNER',
  MEMBER = 'MEMBER',
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

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  name: string;

  @Prop({ enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @Prop({ default: false })
  isClinical: boolean;

  @Prop({ type: Object })
  clinicalProfile?: ClinicalProfile;

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  { clinicId: 1, email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
UserSchema.index({ clinicId: 1, isClinical: 1 });
