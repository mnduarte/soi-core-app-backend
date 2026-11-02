import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

/**
 * Lo que el front manda cuando el usuario cierra un globo de ayuda.
 *
 * Los dos campos son opcionales: cerrar un globo manda `vistas`, y hacer algo
 * que se cuenta (anotar un turno, cargar un trabajo) manda `contadores`.
 *
 * Los topes no son paranoia de formulario: esto es texto libre que viaja al
 * documento del usuario y queda ahí para siempre. Sin límite, un cliente
 * cualquiera puede engordar el documento con basura. Los IDs de los grupos son
 * constantes del código (`pasos.ts`), así que el formato es conocido y chico.
 */
export class UpdateTourDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Matches(/^[a-z0-9-]{1,60}$/, {
    each: true,
    message: 'Identificador de ayuda inválido',
  })
  vistas?: string[];

  /** `{ turnos: 3, trabajos: 1 }`. Se sanea en el service. */
  @IsOptional()
  @IsObject()
  contadores?: Record<string, number>;
}
