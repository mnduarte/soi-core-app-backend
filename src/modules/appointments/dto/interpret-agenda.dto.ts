import { IsString, MaxLength, MinLength } from 'class-validator';

export class InterpretAgendaDto {
  /**
   * La frase, escrita o dictada.
   *
   * El tope no es por el modelo —le entra muchísimo más— sino porque arriba de
   * un par de renglones ya no es "agendame a X el martes": es otra cosa, y
   * conviene que no llegue a costar una llamada.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  texto: string;
}
