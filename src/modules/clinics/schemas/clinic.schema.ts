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

  // Montos rápidos de la Ficha rápida, personalizables por consultorio.
  @Prop({ type: [Number], default: [] })
  quickAmounts: number[];

  // Trabajos/prestaciones rápidas (chips), compartidas por la Agenda (Trabajo)
  // y la Ficha rápida (Prestación). Personalizables por consultorio.
  @Prop({ type: [String], default: [] })
  quickTreatments: string[];

  // Horarios/slots del día en la Libreta (ej. '08:00','08:30'…). Personalizables.
  @Prop({ type: [String], default: [] })
  slotTimes: string[];

  // Categorías de fotos de la galería, personalizables por consultorio.
  // Vacío → el front usa los defaults (Intraoral / Extraoral / Radiografía).
  @Prop({ type: [String], default: [] })
  photoCategories: string[];

  @Prop()
  logoUrl?: string;
}

@Schema({ collection: 'clinics', timestamps: true })
export class Clinic extends BaseEntity {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true })
  slug: string;

  // Backoffice contact info — independent from the OWNER user's email/name
  // because the same clinic might change owners over time.
  @Prop()
  doctorName?: string;

  @Prop()
  city?: string;

  @Prop()
  phone?: string;

  @Prop({ lowercase: true, trim: true })
  contactEmail?: string;

  @Prop({ enum: SubscriptionStatus, default: SubscriptionStatus.TRIAL })
  status: SubscriptionStatus;

  @Prop()
  trialEndsAt?: Date;

  @Prop()
  subscriptionEndsAt?: Date;

  // Precio mensual de ESTE consultorio. Vacío = usa el global de
  // admin_settings. Se guarda solo cuando se negoció algo distinto: hoy todos
  // pagan lo mismo y repetir el número en cada clínica obliga a tocarlas una
  // por una el día que cambie el precio de lista.
  @Prop({ min: 0 })
  planPriceMonthly?: number;

  // ---- Débito automático (Mercado Pago) ----
  // `preapproval` es la suscripción del lado de MP. Guardamos el id para poder
  // consultarla y cancelarla, el estado para mostrarlo sin pegarle a MP en cada
  // listado, y el link mientras esté pendiente de que el dentista lo autorice.
  @Prop({ index: true })
  mpPreapprovalId?: string;

  @Prop({ enum: ['pending', 'authorized', 'paused', 'cancelled'] })
  mpPreapprovalStatus?: string;

  @Prop()
  mpInitPoint?: string;

  @Prop()
  mpFirstChargeAt?: Date;

  // Último cobro rechazado. No suspende nada por sí solo (MP reintenta unos
  // días); sirve para que el backoffice lo muestre y se pueda avisar.
  @Prop()
  mpLastFailureAt?: Date;

  @Prop({ default: '#2F54EB' })
  brandColor: string;

  // Visual treatment for the clinic logo in the app and backoffice. `tooth`
  // = the default Molar diente. `mono` = a colored square with the clinic's
  // initials. Custom upload would add a third option later.
  @Prop({ type: String, enum: ['tooth', 'mono'], default: 'tooth' })
  logoStyle: 'tooth' | 'mono';

  @Prop({ type: Object, default: () => ({}) })
  settings: ClinicSettings;
}

export const ClinicSchema = SchemaFactory.createForClass(Clinic);

ClinicSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
