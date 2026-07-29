import { IsString, IsOptional, IsNumber, IsMongoId } from 'class-validator';

export class CreateGallerySessionDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddPhotoDto {
  @IsString()
  publicId: string;

  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  // Categoría (string libre, personalizable por consultorio).
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Vínculo opcional a un movimiento (cuenta corriente).
  @IsOptional()
  @IsMongoId()
  transactionId?: string;

  // Vínculo opcional a un trabajo (item del plan de tratamiento).
  @IsOptional()
  @IsMongoId()
  treatmentItemId?: string;

  @IsOptional()
  @IsNumber()
  toothNumber?: number;
}

export class UpdateGallerySessionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePhotoDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Vínculo a un movimiento. String de ObjectId para vincular, '' para desvincular.
  @IsOptional()
  @IsString()
  transactionId?: string;

  // Vínculo a un trabajo. String de ObjectId para vincular, '' para desvincular.
  @IsOptional()
  @IsString()
  treatmentItemId?: string;

  @IsOptional()
  @IsNumber()
  toothNumber?: number;
}
