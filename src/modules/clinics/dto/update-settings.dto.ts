import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkingHourDto {
  @IsNumber()
  @Min(0)
  @Max(6)
  day: number;

  @IsString()
  start: string;

  @IsString()
  end: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsNumber()
  appointmentDurationDefault?: number;

  @IsOptional()
  @IsBoolean()
  allowOverlappingAppointments?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHourDto)
  workingHours?: WorkingHourDto[];

  @IsOptional()
  @IsString()
  whatsappTemplate?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  quickAmounts?: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  quickTreatments?: string[];

  @IsOptional()
  @IsArray()
  @Matches(/^\d{2}:\d{2}$/, { each: true })
  slotTimes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoCategories?: string[];
}
