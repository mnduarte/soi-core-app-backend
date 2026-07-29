import {
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
  IsMongoId,
  Min,
  IsDateString,
} from 'class-validator';
import { PaymentMethod, TransactionType } from '../schemas/transaction.schema';

export class CreateTransactionDto {
  @IsMongoId()
  patientId: string;

  // PAYMENT (cobro, default) o CHARGE (cargo manual). El service ignora otros.
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

// Edición de un movimiento de la cuenta corriente (ficha rápida).
export class UpdateTransactionDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
