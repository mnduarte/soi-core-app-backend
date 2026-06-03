import { IsString, IsOptional, IsNumber, IsBoolean, IsMongoId } from 'class-validator';

export class CreateClinicalEntryDto {
  @IsString()
  content: string;

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
