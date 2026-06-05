import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type TransactionDocument = HydratedDocument<Transaction>;

export enum TransactionType {
  // Cargo: lo que el paciente DEBE (un tratamiento realizado). Suma al saldo.
  CHARGE = 'CHARGE',
  // Pago: lo que el paciente abona. Resta del saldo.
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
  VOID = 'VOID',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER',
}

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Transaction extends BaseEntity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Patient' })
  patientId: Types.ObjectId;

  @Prop({ required: true, default: TransactionType.PAYMENT, enum: TransactionType })
  type: TransactionType;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: PaymentMethod.CASH, enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Prop()
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Transaction' })
  relatedTransactionId?: Types.ObjectId;

  @Prop()
  voidedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  voidedBy?: Types.ObjectId;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

TransactionSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 });
TransactionSchema.index({ clinicId: 1, createdAt: -1 });
