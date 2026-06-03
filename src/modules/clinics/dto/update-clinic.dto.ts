import { IsString, IsOptional, IsHexColor } from 'class-validator';

export class UpdateClinicDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsHexColor()
  brandColor?: string;
}
