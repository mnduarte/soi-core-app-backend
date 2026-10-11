import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateConsentDto {
  /** Id de la plantilla dentro de settings.consentTemplates. */
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  templateVersionId?: string;

  @IsOptional()
  @IsNumber()
  templateVersionN?: number;

  @IsString()
  @MaxLength(120)
  templateName: string;

  /** El texto ya con las variables reemplazadas. Lo arma el cliente a partir
   *  de la plantilla, pero el servidor lo congela tal cual llega: es lo que el
   *  paciente va a leer en pantalla y después no cambia más. */
  @IsString()
  @Length(1, 20000)
  finalText: string;

  @IsOptional()
  @IsString()
  workId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dni?: string;
}

export class SignConsentDto {
  /** PNG de la firma en data URI (image/png en base64). */
  @IsString()
  @Length(1, 2_000_000)
  signaturePng: string;

  /** DNI confirmado en la pantalla de firma. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  dni?: string;
}
