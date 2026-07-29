import {
  IsOptional,
  IsEnum,
  IsString,
  IsDateString,
  IsNumber,
  IsMongoId,
} from 'class-validator';
import { WorkStatus } from '../schemas/work.schema';

export class CreateWorkDto {
  @IsMongoId()
  patientId: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  toothNumber?: string;

  @IsOptional()
  @IsString()
  surface?: string;

  @IsOptional()
  @IsEnum(WorkStatus)
  status?: WorkStatus;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsDateString()
  estimatedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateWorkDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  toothNumber?: string;

  @IsOptional()
  @IsString()
  surface?: string;

  @IsOptional()
  @IsEnum(WorkStatus)
  status?: WorkStatus;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsDateString()
  estimatedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
