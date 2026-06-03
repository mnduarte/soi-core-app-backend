import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type ClinicDocument = Clinic & Document;

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class WorkingHour {
  @Prop({ required: true })
  day: number; // 0=Sun … 6=Sat

  @Prop({ required: true })
  start: string; // "09:00"

  @Prop({ required: true })
  end: string; // "18:00"
}

export class ClinicSettings {
  @Prop({ default: 'America/Argentina/Buenos_Aires' })
  timezone: string;

  @Prop({ default: 30 })
  appointmentDurationDefault: number;

  @Prop({ default: false })
  allowOverlappingAppointments: boolean;

  @Prop({ type: [Object], default: [] })
  workingHours: WorkingHour[];

  @Prop({ type: Object, default: { whatsapp: '' } })
  reminderTemplates: { whatsapp: string };

  @Prop()
  logoUrl?: string;
}

@Schema({ collection: 'clinics', timestamps: true })
export class Clinic extends BaseEntity {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ enum: SubscriptionStatus, default: SubscriptionStatus.TRIAL })
  status: SubscriptionStatus;

  @Prop()
  trialEndsAt?: Date;

  @Prop()
  subscriptionEndsAt?: Date;

  @Prop({ default: '#2F54EB' })
  brandColor: string;

  @Prop({ type: Object, default: () => ({}) })
  settings: ClinicSettings;
}

export const ClinicSchema = SchemaFactory.createForClass(Clinic);

ClinicSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
