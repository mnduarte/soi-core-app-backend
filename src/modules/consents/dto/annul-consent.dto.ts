import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AnnulConsentDto {
  /**
   * La contraseña del profesional, en el mismo pedido.
   *
   * Va acá y no en una llamada previa a `/auth/verify-password` a propósito:
   * "verificar y después anular" deja un "ya me verifiqué" del lado del
   * cliente que no prueba nada en el servidor. Pidiéndola en la misma
   * operación, la única forma de anular es sabiendo la clave.
   *
   * El motivo: la tablet se le pasa al paciente para que firme. Un documento
   * firmado no puede caerse porque alguien agarró el aparato desatendido.
   */
  @IsString()
  @IsNotEmpty({ message: 'Hace falta tu contraseña para anular' })
  password: string;

  /**
   * Por qué se anula. Opcional a propósito: obligarlo lleva a que se escriba
   * cualquier cosa con tal de pasar, y un motivo inventado es peor que
   * ninguno. Cuando está, es lo que explica el documento dentro de un año.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
