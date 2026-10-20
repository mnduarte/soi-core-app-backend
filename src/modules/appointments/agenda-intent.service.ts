import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import { Clinic, ClinicDocument } from '../clinics/schemas/clinic.schema';

/**
 * Convierte una frase suelta en una intención de agenda.
 *
 * "agendame a Marcela el martes a las 3 de la tarde" → paciente, fecha y hora.
 * Da igual si la frase se escribió o se dictó: el dictado deja texto, y el
 * texto entra acá. Por eso la función existe aparte del micrófono — en iPad
 * con la app instalada como PWA el dictado no corre, y escribiendo tiene que
 * andar igual.
 *
 * Esto NO agenda nada. Devuelve lo que entendió para que la pantalla lo
 * muestre y una persona confirme. Un error de transcripción en una nota se ve
 * y se corrige; en un turno agenda callado a otro día.
 */

export interface CandidatoPaciente {
  id: string;
  nombre: string;
}

export interface IntencionAgenda {
  /**
   * `agenda` es una pregunta sobre el DÍA, no sobre un paciente: "¿cuál es el
   * próximo turno?", "¿quién es el último del jueves?". Son las que más se
   * dicen en un consultorio y no tienen nombre adentro, así que antes caían
   * todas en `nada`.
   */
  accion: 'agendar' | 'buscar' | 'agenda' | 'nada';
  /** Id real, ya verificado contra la base. Nunca lo que dijo el modelo. */
  patientId: string | null;
  /**
   * El nombre REAL del paciente resuelto, para mostrar.
   *
   * No alcanza con `nombreDicho`: con "Nicolás aguirra" la pantalla decía
   * "Nicolás Aguirra" aunque por dentro llevara el id de Nicolás Aguirre.
   * Parecía acertado y mostraba un nombre que no existe en la ficha.
   */
  patientNombre: string | null;
  /** Lo que se entendió como nombre. Si no hubo match, es el alta posible. */
  nombreDicho: string | null;
  /** Más de uno posible: elige la persona, no el modelo. */
  candidatos: CandidatoPaciente[];
  /** YYYY-MM-DD */
  fecha: string | null;
  /** HH:MM */
  hora: string | null;
  duracionMin: number | null;
  /** "limpieza", "control"… si lo dijo. */
  trabajo: string | null;
  /** Para `agenda`: cuál de los turnos del día se está preguntando. */
  cual: 'proximo' | 'primero' | 'ultimo' | null;
  /** Qué habría que preguntar: "paciente" | "fecha" | "hora". */
  falta: string[];
}

/**
 * Tope de nombres que viajan en el prompt.
 *
 * Hoy entran todos sin esfuerzo (un consultorio chico tiene decenas). Con
 * miles, el prompt se infla y se paga en cada frase. El corte va por
 * `updatedAt` descendente, así que lo que se recorta es lo que hace más
 * tiempo que nadie toca — degrada en vez de reventar.
 *
 * Cuando esto empiece a doler, la salida NO es bajar el tope: es caché de
 * prompt, que para una lista idéntica en cada llamada cuesta una fracción.
 */
const TOPE_PACIENTES = 1500;

/** Los mismos que usa el frontend cuando el consultorio no configuró ninguno. */
const HORARIOS_POR_DEFECTO = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
];

const DIAS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

@Injectable()
export class AgendaIntentService {
  private readonly logger = new Logger(AgendaIntentService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Patient.name)
    private patientModel: Model<PatientDocument>,
    @InjectModel(Clinic.name)
    private clinicModel: Model<ClinicDocument>,
  ) {}

  async interpretar(clinicId: string, texto: string): Promise<IntencionAgenda> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Agendar dictando no está configurado en este servidor.',
      );
    }

    /*
     * Los horarios reales del consultorio.
     *
     * Sin esto el modelo inventaba horas que el consultorio no atiende —"a las
     * 16:40"— y la pantalla las mostraba como si fueran válidas. Los slots los
     * configura el profesional; son la única lista de horas que existe.
     */
    const clinica = await this.clinicModel
      .findById(clinicId, { 'settings.slotTimes': 1 })
      .lean()
      .exec();
    const horarios = clinica?.settings?.slotTimes?.length
      ? clinica.settings.slotTimes
      : HORARIOS_POR_DEFECTO;

    const pacientes = await this.patientModel
      .find(
        { clinicId: new Types.ObjectId(clinicId), deletedAt: null },
        { name: 1, lastName: 1 },
      )
      .sort({ updatedAt: -1 })
      .limit(TOPE_PACIENTES)
      .lean()
      .exec();

    const lista = pacientes.map((p, i) => ({
      // Un índice y no el ObjectId: 24 caracteres por paciente se pagan en
      // cada frase, y un número no se puede inventar sin que se note.
      i: i + 1,
      id: String(p._id),
      nombre: `${p.name ?? ''} ${p.lastName ?? ''}`.trim(),
    }));

    const client = new Anthropic({ apiKey });
    /*
     * Haiku por defecto.
     *
     * Medido sobre 12 frases reales: acierta las 12, igual que Opus, pero
     * responde en 1,6s contra 2,3s y cuesta unas 40 veces menos. Lo que
     * emparejó la diferencia fue una regla del prompt —devolver fecha y hora
     * aunque el paciente no esté en la lista—, que era justo donde Haiku se
     * caía antes.
     *
     * Doce frases no son una evaluación rigurosa: si en uso real aparecen
     * fallas, la variable de entorno cambia el modelo sin tocar código ni
     * volver a deployar.
     */
    const model =
      this.config.get<string>('ANTHROPIC_AGENDA_MODEL') ?? 'claude-haiku-5-5';

    let raw = '';
    try {
      const res = await client.messages.create({
        model,
        // Medido: la respuesta más larga ronda los 240 tokens. 700 deja aire
        // sin que una frase rara pueda irse al infinito. Con el techo en 400
        // una respuesta quedó cortada a la mitad y parecía un error del
        // modelo cuando era el límite.
        max_tokens: 700,
        system: this.sistema(lista, horarios),
        messages: [{ role: 'user', content: texto }],
      });
      if (res.stop_reason === 'max_tokens') {
        this.logger.warn(`Respuesta cortada por max_tokens: "${texto}"`);
        return this.vacia();
      }
      const bloque = res.content.find((b) => b.type === 'text');
      raw = bloque && bloque.type === 'text' ? bloque.text : '';
    } catch (err) {
      this.logger.error('Falló la interpretación de agenda', err as Error);
      throw new InternalServerErrorException(
        'No se pudo interpretar lo que dijiste. Probá de nuevo o cargalo a mano.',
      );
    }

    return this.parsear(raw, lista);
  }

  private sistema(
    lista: { i: number; nombre: string }[],
    horarios: string[],
  ): string {
    // "Ahora" del consultorio. SOI es solo Argentina y sin horario de verano,
    // así que -03:00 es fijo (misma convención que works y transactions).
    const enAr = new Date(Date.now() - 3 * 3600e3);
    const ahora = enAr.toISOString().slice(0, 16).replace('T', ' ');

    return `Convertís una frase dicha por un odontólogo en una acción de agenda.

AHORA: ${ahora} (${DIAS[enAr.getUTCDay()]}), huso -03:00. Toda fecha relativa se resuelve contra esto.
HORARIOS EN QUE ATIENDE (elegí SIEMPRE uno de estos, nunca otro):
${horarios.join(' ')}

PACIENTES DEL CONSULTORIO (elegí por número, nunca inventes uno):
${lista.map((p) => `${p.i}. ${p.nombre}`).join('\n')}

Devolvés SOLO un JSON, sin texto alrededor:
{
 "accion": "agendar" | "buscar" | "agenda" | "nada",
 "paciente": number|null,     // el NÚMERO de la lista, o null
 "nombreDicho": string|null,  // lo que se entendió como nombre, siempre
 "candidatos": [number],      // números, solo si más de uno podría ser
 "fecha": "YYYY-MM-DD"|null,
 "hora": "HH:MM"|null,
 "duracionMin": number|null,
 "trabajo": string|null,      // "limpieza", "control"… si lo dijo
 "cual": "proximo"|"primero"|"ultimo"|null,  // solo para "agenda"
 "falta": [string]            // "paciente" | "fecha" | "hora"
}

REGLAS
- Nunca inventes un paciente. Si lo dicho no coincide con nadie de la lista,
  paciente=null, nombreDicho con lo que se entendió y "paciente" en falta:
  puede ser alguien nuevo, y eso lo decide la persona, no vos.
- Si podrían ser varios, paciente=null y todos en candidatos.
- Tolerá el nombre mal escuchado (sin tildes, apellido aproximado). Si la
  diferencia es chica y hay UNO solo parecido, resolvelo.
- Aunque no encuentres al paciente, devolvé igual la fecha y la hora que hayas
  entendido. Que no esté en la lista no puede costarle también el día.
- \`nombreDicho\` va SIEMPRE que se haya mencionado a alguien, tanto en
  "agendar" como en "buscar", esté o no en la lista. Es lo único que permite
  seguir el camino cuando el nombre vino mal escuchado: sin eso, una búsqueda
  se queda sin a quién buscar.
- Horas ambiguas: es un consultorio. "a las 3" es 15:00, "a las 9" es 09:00.
  Entre las dos lecturas, elegí la que esté en la lista de horarios.
- La hora SIEMPRE sale de esa lista. Si lo que dijeron no coincide con
  ninguno —"a las 16:40"—, devolvé el más cercano de la lista. Un horario que
  el consultorio no atiende no sirve aunque sea lo que se dijo.
- "temprano" = el primero de la lista. "a la tarde" sin hora concreta va a
  falta, no se inventa.
- "agenda" es para preguntas sobre el DÍA, sin nombre de paciente: "¿cuál es
  el próximo turno?" (cual="proximo"), "¿quién es el primero del jueves?"
  (cual="primero", fecha del jueves), "¿de quién es el último?"
  (cual="ultimo"). Si no dicen qué día, dejá fecha en null: se asume hoy.
  Si la pregunta NOMBRA a un paciente, es "buscar", no "agenda".
- Si lo que piden NO se puede expresar con este esquema —mover un turno,
  cancelarlo, cualquier otra cosa— devolvé exactamente {"accion":"nada"} y
  nada más. No expliques ni inventes campos: la pantalla dice que no entendió.`;
  }

  private vacia(): IntencionAgenda {
    return {
      accion: 'nada',
      patientId: null,
      patientNombre: null,
      nombreDicho: null,
      candidatos: [],
      fecha: null,
      hora: null,
      duracionMin: null,
      trabajo: null,
      cual: null,
      falta: [],
    };
  }

  /**
   * Nada de lo que vuelve del modelo se usa tal cual.
   *
   * Un índice fuera de rango, una fecha imposible o una duración absurda
   * terminarían en un turno real. Se valida todo contra la lista que nosotros
   * mandamos y contra formatos cerrados; lo que no pasa, se descarta.
   */
  private parsear(
    raw: string,
    lista: { i: number; id: string; nombre: string }[],
  ): IntencionAgenda {
    let txt = raw.trim();
    const cercado = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (cercado) txt = cercado[1].trim();
    const a = txt.indexOf('{');
    const b = txt.lastIndexOf('}');
    if (a === -1 || b === -1) return this.vacia();

    let d: Record<string, unknown>;
    try {
      d = JSON.parse(txt.slice(a, b + 1)) as Record<string, unknown>;
    } catch {
      return this.vacia();
    }

    const porIndice = (v: unknown): CandidatoPaciente | null => {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isInteger(n)) return null;
      const p = lista.find((x) => x.i === n);
      return p ? { id: p.id, nombre: p.nombre } : null;
    };

    const accion =
      d.accion === 'agendar' || d.accion === 'buscar' || d.accion === 'agenda'
        ? d.accion
        : 'nada';

    const elegido = porIndice(d.paciente);
    const candidatos = Array.isArray(d.candidatos)
      ? d.candidatos
          .map(porIndice)
          .filter((x): x is CandidatoPaciente => x !== null)
      : [];

    const texto = (v: unknown, max: number): string | null => {
      if (typeof v !== 'string') return null;
      const t = v.trim();
      return t ? t.slice(0, max) : null;
    };

    const fechaCruda = texto(d.fecha, 10);
    // Formato Y fecha real: "2026-02-31" pasa la regex y no existe.
    const fecha =
      fechaCruda && /^\d{4}-\d{2}-\d{2}$/.test(fechaCruda)
        ? fechaCruda.slice(0, 10) ===
          new Date(`${fechaCruda}T12:00:00Z`).toISOString().slice(0, 10)
          ? fechaCruda
          : null
        : null;

    const horaCruda = texto(d.hora, 5);
    const hora =
      horaCruda && /^([01]\d|2[0-3]):[0-5]\d$/.test(horaCruda)
        ? horaCruda
        : null;

    const dur = typeof d.duracionMin === 'number' ? d.duracionMin : null;
    const duracionMin = dur && dur >= 5 && dur <= 480 ? Math.round(dur) : null;

    const falta = Array.isArray(d.falta)
      ? d.falta.filter(
          (f): f is string => f === 'paciente' || f === 'fecha' || f === 'hora',
        )
      : [];

    return {
      accion,
      patientId: elegido?.id ?? null,
      patientNombre: elegido?.nombre ?? null,
      nombreDicho: texto(d.nombreDicho, 80),
      candidatos: elegido ? [] : candidatos,
      fecha,
      hora,
      duracionMin,
      trabajo: texto(d.trabajo, 120),
      cual:
        d.cual === 'proximo' || d.cual === 'primero' || d.cual === 'ultimo'
          ? d.cual
          : null,
      falta,
    };
  }
}
