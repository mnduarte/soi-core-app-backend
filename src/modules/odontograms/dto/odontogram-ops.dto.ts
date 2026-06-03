import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsIn, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ToothConditionStatus } from '../schemas/odontogram.schema';

export class ToothConditionDto {
  @IsString()
  surface: string;

  @IsString()
  condition: string;

  @IsOptional()
  @IsEnum(ToothConditionStatus)
  status?: ToothConditionStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class OdontogramOpDto {
  @IsIn(['set_condition', 'remove_condition', 'set_status', 'set_notes'])
  type: string;

  @IsNumber()
  toothNumber: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ToothConditionDto)
  condition?: ToothConditionDto;

  @IsOptional()
  @IsString()
  surface?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApplyOpsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OdontogramOpDto)
  ops: OdontogramOpDto[];

  @IsOptional()
  saveSnapshot?: boolean;
}
