import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AdminUserDocument = HydratedDocument<AdminUser>;

@Schema({ timestamps: true })
export class AdminUser {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: 'SUPERADMIN' })
  role: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);
