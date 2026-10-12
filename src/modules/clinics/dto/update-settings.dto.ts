import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  Matches,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ClinicFeaturesDto {
  @IsOptional()
  @IsBoolean()
  evolucion?: boolean;

  @IsOptional()
  @IsBoolean()
  consentimientos?: boolean;
}

export class ConsentTemplateVersionDto {
  @IsString()
  @MaxLength(60)
  id: string;

  @IsNumber()
  n: number;

  @IsString()
  @MaxLength(20000)
  body: string;

  @IsString()
  createdAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  createdByName?: string;
}

export class ConsentTemplateDto {
  @IsString()
  @MaxLength(60)
  id: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsentTemplateVersionDto)
  versions: ConsentTemplateVersionDto[];
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsentTemplateDto)
  consentTemplates?: ConsentTemplateDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ClinicFeaturesDto)
  features?: ClinicFeaturesDto;
}
