import { IsString, MinLength, MaxLength } from 'class-validator';

export class DictarPlanDto {
  @IsString()
  @MinLength(2)
  // Un dictado largo en serio ronda los 300 caracteres; el tope es para que un
  // reconocedor que se quedó abierto no mande media hora de audio transcripto.
  @MaxLength(2000)
  texto: string;
}
