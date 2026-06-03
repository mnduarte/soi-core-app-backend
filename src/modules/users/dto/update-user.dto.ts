import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
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
