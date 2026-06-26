import {
  IsString,
  IsOptional,
  IsEmail,
  IsDateString,
  IsBoolean,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class MedicalHistoryDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medications?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePatientDto {
  @IsString()
  name: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  dni?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(130)
  age?: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  locality?: string;

  @IsOptional()
  @IsString()
  obraSocial?: string;

  @IsOptional()
  @IsString()
  nAfiliado?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  medicalHistory?: MedicalHistoryDto;
}
