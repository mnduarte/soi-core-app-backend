import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { sinPensar } from '../../common/anthropic/sin-pensar';

/**
 * Convierte en trabajos lo que el odontólogo dicta como plan de tratamiento.
 *
 * "Conducto y perno y corona en el 21, trescientos cincuenta mil" → tres
 * trabajos, los tres en la pieza 21, el precio una sola vez.
 *
 * ── Por qué dictado y no foto ──
 * El plan escrito en la ficha de papel es taquigrafía personal ("Rx t / TC t /
 * Rec / 150.000 / (3)"): se puede transcribir, pero no se sabe si esos 150.000
 * son de un trabajo o de los tres. Dictando, el dato nace estructurado porque
 * lo estructura quien lo sabe.
 *
 * ── La regla que más importa ──
 * El precio NO se reparte ni se repite. "Extracción, blanqueamiento y dos
 * arreglos, todo 180 mil" son cuatro trabajos y UN precio: si el modelo le
 * pone 180.000 a cada uno, el "Falta cobrar" del paciente pasa a decir 720.000.
 * Esto no es un error de transcripción, es plata mal contada.
 */

export interface TrabajoDictado {
  descripcion: string;
  /** Pieza dentaria si la dijo, como texto libre ("16", "35 y 36"). */
  pieza: string | null;
  precio: number | null;
}

const SISTEMA = `Convertís en trabajos lo que un odontólogo dicta como plan de tratamiento.

Devolvés SOLO este JSON, sin texto alrededor:
{"trabajos":[{"descripcion":string,"pieza":string|null,"precio":number|null}]}

REGLAS
- Un trabajo por cada cosa que nombre. "y" y las pausas separan trabajos.
- "precio" solo el número, sin puntos ni símbolos. "ciento cincuenta mil" = 150000. "150 lucas" = 150000. "dos palos" = 2000000.
- Si dice un precio para varios trabajos juntos, poneselo al ÚLTIMO y dejá los otros en null. No lo repartas ni lo repitas: estarías inventando plata.
- "pieza" es el número de diente si lo dice (11-48 o 51-85); si no, null. Si nombra varias piezas para un mismo trabajo, van juntas ("35 y 36").
- Escribí la descripción como la diría un odontólogo, sin abreviar: "conducto" → "Tratamiento de conducto".
- Lo que no se dijo va null. Nunca inventes un precio.
- Si no se entiende ningún trabajo, devolvé {"trabajos":[]}.`;

const FOTO = `Esta es la foto de la columna "PLAN DE TRATAMIENTO" de una ficha odontológica argentina en papel, escrita a mano.

Devolvés SOLO este JSON, sin texto alrededor:
{"trabajos":[{"descripcion":string,"pieza":string|null,"precio":number|null}]}

REGLAS
- Un trabajo por renglón escrito. Los renglones en blanco no se listan.
- Está escrito en abreviaturas de consultorio. Desarrollalas: "Rx" = Radiografía, "TC" = Tratamiento de conducto, "Ext" = Extracción, "Obt" = Obturación, "Rec" = Reconstrucción, "Prot" = Prótesis, "Cor" = Corona, "Limp"/"Prof" = Limpieza. Si una abreviatura NO la reconocés, devolvela tal cual como está escrita; no adivines qué quiso decir.
- Las marcas de "hecho" (una cruz, un tilde, un subrayado) NO son parte del nombre del trabajo: sacalas.
- Un número suelto grande es el precio. Si no se ve a qué renglón corresponde, poneselo al ÚLTIMO trabajo y dejá los otros en null. NUNCA lo repitas en varios: estarías inventando plata.
- Un número chico entre paréntesis —"(3)"— suele ser cantidad de cuotas o de sesiones, NO es un precio. No lo pongas en precio.
- Si no se entiende un renglón, no lo inventes: omitilo.
- Si la columna está vacía, devolvé {"trabajos":[]}.`;

/** Nadie cobra más que esto por un trabajo: un cero de más es un error. */
const PRECIO_MAX = 100_000_000;

@Injectable()
export class PlanDictadoService {
  private readonly logger = new Logger(PlanDictadoService.name);

  constructor(private readonly config: ConfigService) {}

  async interpretar(texto: string): Promise<TrabajoDictado[]> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Dictar el plan no está configurado en este servidor.',
      );
    }

    const client = new Anthropic({ apiKey });
    const model =
      this.config.get<string>('ANTHROPIC_AGENDA_MODEL') ?? 'claude-haiku-5-5';

    let raw = '';
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 1200,
        // Sin razonar: separar lo dictado en trabajos es leer, no deducir.
        // Ver sin-pensar.ts para por qué cada familia lo apaga distinto.
        ...sinPensar(model),
        system: SISTEMA,
        messages: [{ role: 'user', content: texto }],
      });
      if (res.stop_reason === 'max_tokens') {
        this.logger.warn(`Respuesta cortada: "${texto}"`);
        throw new InternalServerErrorException(
          'Se cortó la interpretación. Probá dictando de a menos trabajos.',
        );
      }
      const bloque = res.content.find((b) => b.type === 'text');
      raw = bloque && bloque.type === 'text' ? bloque.text : '';
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error('Falló el dictado del plan', err as Error);
      throw new InternalServerErrorException(
        'No se pudo interpretar lo que dijiste. Probá de nuevo o cargalo a mano.',
      );
    }

    return this.parsear(raw);
  }

  /**
   * Lo mismo pero leyendo la columna del papel en vez de escuchando.
   *
   * Devuelve la MISMA forma que el dictado a propósito: las dos cosas terminan
   * en la misma pantalla de revisión. El odontólogo corrige ahí, no importa de
   * dónde salió.
   *
   * Acá sí se deja razonar, al revés que en el dictado: la columna es
   * taquigrafía manuscrita y chica. Es el mismo criterio que ficha-scan.
   */
  async desdeFoto(
    imagenBase64: string,
    mediaType: string,
  ): Promise<TrabajoDictado[]> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'La lectura por foto no está configurada en este servidor.',
      );
    }

    const client = new Anthropic({ apiKey });
    const model =
      this.config.get<string>('ANTHROPIC_VISION_MODEL') ?? 'claude-sonnet-5-5';

    let raw = '';
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 3000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType as
                    | 'image/jpeg'
                    | 'image/png'
                    | 'image/webp'
                    | 'image/gif',
                  data: imagenBase64,
                },
              },
              { type: 'text', text: FOTO },
            ],
          },
        ],
      });
      if (res.stop_reason === 'max_tokens') {
        this.logger.warn('La lectura del plan se cortó por max_tokens');
        throw new InternalServerErrorException(
          'Se cortó la lectura del plan. Probá con una foto más de cerca.',
        );
      }
      const bloque = res.content.find((b) => b.type === 'text');
      raw = bloque && bloque.type === 'text' ? bloque.text : '';
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error('Falló la lectura del plan por foto', err as Error);
      throw new InternalServerErrorException(
        'No se pudo leer el plan de la foto. Probá con una foto más nítida.',
      );
    }

    return this.parsear(raw);
  }

  /**
   * Nada se usa tal cual: de acá sale una propuesta que el odontólogo revisa,
   * pero un precio absurdo o negativo no tiene por qué llegar a la pantalla.
   */
  private parsear(raw: string): TrabajoDictado[] {
    let txt = raw.trim();
    const cercado = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (cercado) txt = cercado[1].trim();
    const a = txt.indexOf('{');
    const b = txt.lastIndexOf('}');
    if (a === -1 || b === -1) return [];

    let d: { trabajos?: unknown };
    try {
      d = JSON.parse(txt.slice(a, b + 1)) as { trabajos?: unknown };
    } catch {
      return [];
    }
    if (!Array.isArray(d.trabajos)) return [];

    const fuera: TrabajoDictado[] = [];
    for (const item of d.trabajos.slice(0, 20)) {
      if (!item || typeof item !== 'object') continue;
      const t = item as Record<string, unknown>;

      const descripcion =
        typeof t.descripcion === 'string'
          ? t.descripcion.trim().slice(0, 120)
          : '';
      // Sin descripción no es un trabajo: una fila vacía con precio sería
      // plata colgada de nada.
      if (!descripcion) continue;

      const pieza =
        typeof t.pieza === 'string' && t.pieza.trim()
          ? t.pieza.trim().slice(0, 40)
          : null;

      let precio: number | null = null;
      if (typeof t.precio === 'number' && Number.isFinite(t.precio)) {
        const n = Math.round(t.precio);
        if (n > 0 && n <= PRECIO_MAX) precio = n;
        else
          this.logger.warn(`Precio descartado por fuera de rango: ${t.precio}`);
      }

      fuera.push({ descripcion, pieza, precio });
    }
    return fuera;
  }
}
