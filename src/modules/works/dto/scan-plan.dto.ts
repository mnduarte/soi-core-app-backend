import { IsString } from 'class-validator';

// La imagen viaja en base64 (sin el prefijo `data:...;base64,`) junto con su
// tipo. El frontend la reescala antes de mandarla, igual que en /patients/scan.
export class ScanPlanDto {
  @IsString()
  image: string;

  @IsString()
  mediaType: string;
}
