import { IsNumber, IsOptional, IsString, IsEnum, IsMongoId, Min } from 'class-validator';
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
}
