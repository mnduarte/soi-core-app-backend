import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../schemas/user.schema';

export class UpdateClinicalProfileDto {
  @IsOptional()
  @IsString()
  license?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dni?: string;

  // Una firma dibujada pesa decenas de kB; el tope deja margen y corta
  // cualquier intento de meter una imagen grande por acá.
  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  signaturePng?: string;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsString()
  agendaColor?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isClinical?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateClinicalProfileDto)
  clinicalProfile?: UpdateClinicalProfileDto;
}
