import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  MERCADO_PAGO = 'MERCADO_PAGO',
  OTHER = 'OTHER',
}

export type ClinicPaymentDocument = ClinicPayment & Document;

/**
 * Un pago de suscripción de un consultorio.
 *
 * Hasta ahora "registrar pago" solo empujaba `subscriptionEndsAt`: el sistema
 * sabía HASTA CUÁNDO estaba paga una cuenta, pero no qué se pagó, cuándo ni
 * cuánto. Sin eso no hay contra qué conciliar cuando el cobro pase a ser
 * automático, ni cómo responder "¿desde cuándo paga este consultorio?".
 *
 * Deliberadamente sin nada fiscal (número de comprobante, IVA, CAE): eso llega
 * con la facturación, y ahí las reglas las define el contador, no el código.
 */
@Schema({ collection: 'clinic_payments', timestamps: true })
export class ClinicPayment {
  @Prop({ type: Types.ObjectId, ref: 'Clinic', required: true, index: true })
  clinicId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  /** Cuándo se cobró (no cuándo se cargó: se puede registrar en diferido). */
  @Prop({ required: true })
  paidAt: Date;

  @Prop({ enum: PaymentMethod, default: PaymentMethod.TRANSFER })
  method: PaymentMethod;

  // Período que cubre el pago. Es lo que permite decir "está pago hasta marzo"
  // sin depender de `subscriptionEndsAt`, que se puede haber movido a mano.
  @Prop({ required: true })
  periodFrom: Date;

  @Prop({ required: true })
  periodTo: Date;

  @Prop({ trim: true })
  notes?: string;

  /** Admin que lo registró. Vacío = lo generó un cobro automático. */
  @Prop({ type: Types.ObjectId, ref: 'AdminUser' })
  recordedBy?: Types.ObjectId;

  // Reservado para el débito automático: el id del pago en Mercado Pago. Único
  // (cuando existe) para que un webhook reenviado no cargue el pago dos veces
  // — MP reintenta las notificaciones y llegan repetidas.
  @Prop()
  mpPaymentId?: string;

  @Prop()
  deletedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const ClinicPaymentSchema = SchemaFactory.createForClass(ClinicPayment);

// Listado por consultorio, del más reciente al más viejo.
ClinicPaymentSchema.index({ clinicId: 1, paidAt: -1 });
// Idempotencia del webhook: sin `partialFilterExpression` los pagos manuales
// (todos sin mpPaymentId) chocarían entre sí por tener el campo en null.
ClinicPaymentSchema.index(
  { mpPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: { mpPaymentId: { $type: 'string' } },
  },
);
