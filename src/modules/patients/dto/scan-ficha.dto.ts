import { IsString } from 'class-validator';

// Image is sent as base64 (without the `data:...;base64,` prefix) plus its
// media type. The frontend downscales the photo before sending.
export class ScanFichaDto {
  @IsString()
  image: string;

  @IsString()
  mediaType: string;
}
