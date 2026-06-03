import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type AppointmentDocument = HydratedDocument<Appointment>;

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

// Ficha lifecycle is independent of the turno: a COMPLETED appointment can have
// a PENDING ficha (patient came but documentation isn't finished yet).
export enum FichaStatus {
  PENDING = 'PENDING',
  DONE = 'DONE',
}

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Appointment extends BaseEntity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Patient' })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  professionalId?: Types.ObjectId;

  @Prop({ required: true })
  startsAt: Date;

  @Prop({ required: true })
  endsAt: Date;

  @Prop({ default: AppointmentStatus.SCHEDULED, enum: AppointmentStatus })
  status: AppointmentStatus;

  // `type: String` is needed because the union `FichaStatus | null` strips the
  // reflected metadata and @nestjs/mongoose can't infer the schema type.
  @Prop({ type: String, enum: FichaStatus, default: null })
  ficha?: FichaStatus | null;

  @Prop()
  title?: string;

  @Prop()
  notes?: string;

  @Prop({ default: false })
  reminderSent: boolean;

  @Prop()
  reminderSentAt?: Date;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);

AppointmentSchema.index({ clinicId: 1, startsAt: 1, deletedAt: 1 });
AppointmentSchema.index({ clinicId: 1, patientId: 1, deletedAt: 1 });
AppointmentSchema.index({ clinicId: 1, professionalId: 1, startsAt: 1, deletedAt: 1 });
