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

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsNumber()
  toothNumber?: number;
}
