import { IsNumber, IsOptional, IsString, IsEnum, IsMongoId, Min } from 'class-validator';
import { PaymentMethod } from '../schemas/transaction.schema';

export class CreateTransactionDto {
  @IsMongoId()
  patientId: string;

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
