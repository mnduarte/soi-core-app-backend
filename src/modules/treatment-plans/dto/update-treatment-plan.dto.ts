import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsEnum, IsString, IsDateString, IsNumber } from 'class-validator';
import { CreateTreatmentPlanDto } from './create-treatment-plan.dto';
import { TreatmentItemStatus } from '../schemas/treatment-plan.schema';

export class UpdateTreatmentPlanDto extends PartialType(CreateTreatmentPlanDto) {}

export class UpdateTreatmentItemDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  toothNumber?: number;

  @IsOptional()
  @IsString()
  surface?: string;

  @IsOptional()
  @IsEnum(TreatmentItemStatus)
  status?: TreatmentItemStatus;

  @IsOptional()
  @IsDateString()
  estimatedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// New: append a single item to an existing plan.
export class AddTreatmentItemDto {
  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  toothNumber?: number;

  @IsOptional()
  @IsString()
  surface?: string;

  @IsOptional()
  @IsEnum(TreatmentItemStatus)
  status?: TreatmentItemStatus;

  @IsOptional()
  @IsDateString()
  estimatedDate?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
