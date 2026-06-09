import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { PhotoType } from '../schemas/gallery-session.schema';

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
  @IsEnum(PhotoType)
  type?: PhotoType;

  @IsOptional()
  @IsString()
  caption?: string;

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
  @IsEnum(PhotoType)
  type?: PhotoType;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsNumber()
  toothNumber?: number;
}
