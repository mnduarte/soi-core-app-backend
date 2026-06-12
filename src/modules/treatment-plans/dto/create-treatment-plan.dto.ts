import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsEnum, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { TreatmentItemStatus } from '../schemas/treatment-plan.schema';

export class CreateTreatmentItemDto {
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  toothNumber?: string;

  @IsOptional()
  @IsString()
  surface?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

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

export class CreateTreatmentPlanDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTreatmentItemDto)
  items?: CreateTreatmentItemDto[];
}
