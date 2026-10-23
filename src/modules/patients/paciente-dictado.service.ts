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
 * Convierte una frase dicha en los campos de la ficha de un paciente.
 *
 * "Marcela Ibarrola, 41 años, OSDE, 11 5623 4891" → nombre, edad, obra social
 * y teléfono, cada uno en su casillero.
 *
 * ── Por qué de corrido y no campo por campo ──
 * Preguntar un dato a la vez obligaría a arrancar y parar el reconocedor seis
 * veces, y ahí es donde el dictado de Android se pone caprichoso (ver
 * useDictado). De corrido es un arranque, una parada, y el reparto se hace
 * acá. Además nadie habla de a un dato: se dice todo junto.
 *
 * ── Por qué un servicio aparte del de la agenda ──
 * Mismo mecanismo, otro dominio. Mezclarlos daría un prompt que tiene que
 * saber de turnos Y de fichas, y cada regla nueva de uno empeoraría al otro.
 */

export interface DatosPaciente {
  fullName: string | null;
  /** Solo el número. */
  age: string | null;
  /** YYYY-MM-DD */
  birthDate: string | null;
  dni: string | null;
  phone: string | null;
  email: string | null;
  obraSocial: string | null;
  nAfiliado: string | null;
  address: string | null;
  locality: string | null;
  notes: string | null;
}

const VACIO: DatosPaciente = {
  fullName: null,
  age: null,
  birthDate: null,
  dni: null,
  phone: null,
  email: null,
  obraSocial: null,
  nAfiliado: null,
  address: null,
  locality: null,
  notes: null,
};

const SISTEMA = `Repartís en campos lo que un odontólogo dice sobre un paciente.

Devolvés SOLO un JSON, sin texto alrededor:
{
 "fullName": string|null,    // nombre y apellido, como se escribe
 "age": string|null,         // solo el número
 "birthDate": "YYYY-MM-DD"|null,
 "dni": string|null,         // solo dígitos
 "phone": string|null,       // solo dígitos, con característica si la dijo
 "email": string|null,
 "obraSocial": string|null,  // OSDE, Swiss Medical, Particular…
 "nAfiliado": string|null,
 "address": string|null,
 "locality": string|null,
 "notes": string|null        // alergias, antecedentes, lo que no entre arriba
}

REGLAS
- Lo que NO se dijo va en null. No completes, no deduzcas, no inventes.
- Los números vienen dictados y llegan como se escuchan: "once cincuenta y
  seis veintitrés cuarenta y ocho noventa y uno" es 1156234891. Dejá SOLO
  dígitos en dni y phone — sin espacios, guiones ni paréntesis.
- Si dice una edad, va en age. Si dice una fecha de nacimiento, va en
  birthDate. Si dice las dos, van las dos. Nunca calcules una desde la otra:
  una edad calculada envejece sola y la fecha es el dato bueno.
- El nombre se escribe con mayúscula inicial y sin tildes de más: "marcela
  ibarrola" es "Marcela Ibarrola".
- "particular", "sin obra social" o "no tiene" en obraSocial es "Particular".
- Lo que se dijo y no encaja en ningún campo —una alergia, un antecedente— va
  a notes, no se descarta.`;

@Injectable()
export class PacienteDictadoService {
  private readonly logger = new Logger(PacienteDictadoService.name);

  constructor(private readonly config: ConfigService) {}

  async interpretar(texto: string): Promise<DatosPaciente> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Cargar dictando no está configurado en este servidor.',
      );
    }

    const client = new Anthropic({ apiKey });
    const model =
      this.config.get<string>('ANTHROPIC_AGENDA_MODEL') ?? 'claude-haiku-5-5';

    let raw = '';
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 700,
        // Sin razonar. Medido sobre seis frases dictadas de verdad: pensando
        // acertó 16/19 campos y cortó una respuesta entera por quedarse sin
        // tokens; sin pensar, 19/19 y un segundo menos. El porqué y la forma
        // que necesita cada modelo, en sin-pensar.ts.
        ...sinPensar(model),
        system: SISTEMA,
        messages: [{ role: 'user', content: texto }],
      });
      if (res.stop_reason === 'max_tokens') {
        // Ya no debería pasar, pero si pasa se avisa. Devolver todo vacío
        // dejaba el formulario igual que antes y sin ningún mensaje: se leía
        // como que el micrófono no había escuchado nada.
        this.logger.warn(`Respuesta cortada: "${texto}"`);
        throw new InternalServerErrorException(
          'Se cortó la interpretación. Probá diciéndolo más corto.',
        );
      }
      const bloque = res.content.find((b) => b.type === 'text');
      raw = bloque && bloque.type === 'text' ? bloque.text : '';
    } catch (err) {
      // El corte por max_tokens ya viene con su propio mensaje; sin esto lo
      // taparía el genérico de abajo.
      if (err instanceof HttpException) throw err;
      this.logger.error('Falló el dictado de paciente', err as Error);
      throw new InternalServerErrorException(
        'No se pudo interpretar lo que dijiste. Probá de nuevo o cargalo a mano.',
      );
    }

    return this.parsear(raw);
  }

  /**
   * Nada se usa tal cual: esto va a un formulario que después se guarda.
   * Un teléfono con letras o un email sin arroba llegarían a la ficha.
   */
  private parsear(raw: string): DatosPaciente {
    let txt = raw.trim();
    const cercado = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (cercado) txt = cercado[1].trim();
    const a = txt.indexOf('{');
    const b = txt.lastIndexOf('}');
    if (a === -1 || b === -1) return VACIO;

    let d: Record<string, unknown>;
    try {
      d = JSON.parse(txt.slice(a, b + 1)) as Record<string, unknown>;
    } catch {
      return VACIO;
    }

    const texto = (v: unknown, max: number): string | null => {
      if (typeof v !== 'string') return null;
      const t = v.trim();
      return t ? t.slice(0, max) : null;
    };
    const digitos = (v: unknown, min: number, max: number): string | null => {
      const t = texto(v, 40);
      if (!t) return null;
      const n = t.replace(/\D/g, '');
      return n.length >= min && n.length <= max ? n : null;
    };

    const fecha = texto(d.birthDate, 10);
    const birthDate =
      fecha &&
      /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
      fecha === new Date(`${fecha}T12:00:00Z`).toISOString().slice(0, 10)
        ? fecha
        : null;

    const edad = digitos(d.age, 1, 3);
    const mail = texto(d.email, 120);

    return {
      fullName: texto(d.fullName, 80),
      age: edad && Number(edad) <= 120 ? edad : null,
      birthDate,
      dni: digitos(d.dni, 6, 9),
      phone: digitos(d.phone, 8, 15),
      // Sin arroba no es un mail: llegaría a la ficha y rompería el
      // recordatorio sin que nadie se entere.
      email: mail && mail.includes('@') ? mail : null,
      obraSocial: texto(d.obraSocial, 60),
      nAfiliado: texto(d.nAfiliado, 40),
      address: texto(d.address, 120),
      locality: texto(d.locality, 80),
      notes: texto(d.notes, 500),
    };
  }
}
