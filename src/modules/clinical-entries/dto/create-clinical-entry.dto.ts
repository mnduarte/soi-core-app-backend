import { IsString, IsOptional, IsNumber, IsBoolean, IsMongoId, IsEnum } from 'class-validator';
import { ClinicalEntryType } from '../schemas/clinical-entry.schema';

export class CreateClinicalEntryDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsEnum(ClinicalEntryType)
  type?: ClinicalEntryType;

  // Turno que se está documentando. Si viene, la entrada queda enlazada y el
  // turno pasa a ficha = DONE (se apaga el badge "ficha pendiente").
  @IsOptional()
  @IsMongoId()
  appointmentId?: string;

  @IsOptional()
  @IsNumber()
  toothNumber?: number;

  @IsOptional()
  @IsString()
  procedure?: string;

  @IsOptional()
  @IsMongoId()
  professionalId?: string;

  @IsOptional()
  @IsBoolean()
  isCorrection?: boolean;

  @IsOptional()
  @IsMongoId()
  correctedEntryId?: string;
}
