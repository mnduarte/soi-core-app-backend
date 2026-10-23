import { IsString, MaxLength, MinLength } from 'class-validator';

export class DictarPacienteDto {
  /**
   * Lo dicho de corrido: "Marcela Ibarrola, 41 años, OSDE, 11 5623 4891".
   *
   * El tope es generoso porque acá puede venir también un antecedente o una
   * alergia, que es texto libre y se guarda en notas.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(600)
  texto: string;
}
