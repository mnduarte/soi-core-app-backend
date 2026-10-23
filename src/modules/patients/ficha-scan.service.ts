import {
  HttpException,
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

// Fields we try to read off a paper dental record. All optional — the dentist
// reviews and corrects in the form before saving.
export interface ExtractedPatient {
  name?: string;
  lastName?: string;
  birthDate?: string;
  age?: string;
  dni?: string;
  phone?: string;
  email?: string;
  obraSocial?: string;
  address?: string;
  locality?: string;
  notes?: string;
}

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const PROMPT = `Esta es la foto de una ficha odontológica en papel de Argentina, normalmente con datos escritos a mano. Leé los datos del paciente.

Respondé ÚNICAMENTE con un objeto JSON (sin texto antes ni después, sin bloques de código) con estas claves:
{
  "name": "nombre de pila",
  "lastName": "apellido",
  "birthDate": "fecha de nacimiento en formato YYYY-MM-DD",
  "age": "edad en años, solo el número (si la ficha tiene la edad escrita)",
  "dni": "documento, solo números",
  "phone": "teléfono",
  "email": "email",
  "obraSocial": "obra social / cobertura (Particular si no tiene)",
  "address": "domicilio",
  "locality": "localidad",
  "notes": "antecedentes, alergias u observaciones clínicas relevantes"
}

Reglas:
- Dejá el valor como cadena vacía "" en cualquier campo que NO aparezca claramente en la ficha.
- No inventes ni completes datos que no estén escritos.
- birthDate siempre en formato YYYY-MM-DD (si la ficha dice 12/06/2011, devolvé "2011-06-12").

MUY IMPORTANTE — la foto puede estar ROTADA 90 o 180 grados, o torcida. Leela igual, en cualquier orientación.

NUNCA inventes. Si una letra no se entiende, es preferible devolver "" antes que adivinar un nombre o un número plausible. Un dato inventado en una ficha clínica es peor que un campo vacío.
- La ficha trae etiquetas IMPRESAS ("Domicilio", "Localidad", "Obra Social", "DNI", "Edad", "Teléfono", "Profesión", "REFERENCIAS", "TRATAMIENTO ACTUAL"). Esas palabras son del formulario, NO son datos del paciente: jamás las devuelvas como valor.
- Si el renglón al lado de una etiqueta está en blanco, ese campo va "".
- En "APELLIDO Y NOMBRE" el apellido viene PRIMERO y después el nombre.
- "lastName" es SOLO el apellido, casi siempre UNA palabra (a veces dos si es compuesto). Todo lo demás de ese renglón son nombres de pila y van en "name". Ante la duda, el apellido es la primera palabra sola.
- No completes el odontograma ni las referencias: solo los datos de la cabecera.
- ANTES de devolver birthDate, hacé esta cuenta: ¿cuántos años tendría hoy alguien nacido en esa fecha? Si no coincide con la edad escrita en la ficha, leíste mal el año: dejá birthDate en "" y devolvé solo la edad. Más vale la edad sola que una fecha equivocada, porque la fecha después pisa a la edad.`;

@Injectable()
export class FichaScanService {
  private readonly logger = new Logger(FichaScanService.name);

  constructor(private readonly config: ConfigService) {}

  async extract(
    imageBase64: string,
    mediaType: string,
  ): Promise<ExtractedPatient> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'La lectura por foto no está configurada (falta ANTHROPIC_API_KEY).',
      );
    }
    if (!ALLOWED_MEDIA.includes(mediaType)) {
      throw new BadRequestException('Formato de imagen no soportado.');
    }

    const client = new Anthropic({ apiKey });
    // Lo que hace falta acá es un modelo BUENO mirando la imagen, no un modelo
    // que razone. Medido contra una ficha real (foto de 899x1599, rotada 90°,
    // letra a mano), siete campos verificables, tres corridas cada uno:
    //
    //   haiku-4-5,  como venía ....... 3/7 4/7 3/7   US$0,003   1,3s
    //   haiku-4-5,  foto enderezada .. 6/7 5/7 5/7   US$0,003   1,6s
    //   haiku-5-5,  sin pensar ....... 5/7 6/7 7/7   US$0,0003  1,4s
    //   haiku-5-5,  pensando ......... 7/7 6/7 7/7   US$0,001   8,0s
    //   sonnet-5-5, pensando ......... 7/7 ×3        US$0,021   7,3s
    //   sonnet-5-5, effort low ....... 7/7 ×8        US$0,010   1,5s  ← este
    //
    // Bajarle el esfuerzo salió gratis, pero recién DESPUÉS de taparle el
    // único agujero que tenía. El modelo rápido leía bien todo salvo la FECHA
    // DE NACIMIENTO: en esta ficha el año está borroneado y la edad (13) está
    // escrita al lado, y devolvía "2026-06-12" (o sea 0 años) en 4 de cada 5.
    // Eso no queda quieto en su casillero: el formulario calcula la edad desde
    // la fecha, así que un campo mal leído DESTRUYE uno bien leído.
    //
    // Se tapó por los dos lados: la regla del prompt que le hace cruzar la
    // fecha contra la edad antes de responder (6/6 limpias), y
    // descartarFechaImposible() acá abajo, que no depende de que el modelo
    // obedezca. Con las dos, el resultado final es idéntico al de razonar:
    // 5/5 fichas perfectas en 1,5s y a mitad de precio.
    //
    // Haiku no sólo erraba: INVENTABA. Devolvía un apellido distinto en cada
    // intento (Muñoz, Huidobro, Catalina) para una ficha que dice Cruz, y
    // metía etiquetas impresas del formulario como si fueran datos. Un nombre
    // inventado en una ficha clínica es peor que un campo vacío. Aun con la
    // foto derecha se comía un dígito del teléfono, que es el dato con el que
    // después se manda el recordatorio.
    //
    // Siete segundos y dos centavos por ficha es barato contra tipearla: una
    // migración de 500 pacientes sale US$10 una sola vez.
    //
    // Se evaluó enderezar la foto antes de mandarla y sale más caro de lo que
    // parece: el backend no tiene librería de imágenes, hace falta una llamada
    // extra para detectar el ángulo, y el modelo acierta los grados pero no el
    // sentido (dijo "90 horario" cuando la buena era la antihoraria).
    // Haiku 5.5 es treinta veces más barato y tienta, pero sin pensar confunde
    // el apellido (devolvió "Chas" por "Cruz") y pensando tarda MÁS que Sonnet.
    const model =
      this.config.get<string>('ANTHROPIC_VISION_MODEL') ?? 'claude-sonnet-5-5';

    let raw: string;
    try {
      const res = await client.messages.create({
        model,
        // Con razonamiento el presupuesto se reparte entre pensar y escribir,
        // así que hay que dejarle aire o la respuesta llega cortada.
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
                  data: imageBase64,
                },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      });
      if (res.stop_reason === 'max_tokens') {
        // Antes esto no se miraba: la respuesta cortada caía en el parser,
        // no era JSON válido y volvía {} — o sea, "no se leyó nada" sin
        // ninguna pista de por qué.
        this.logger.warn('La lectura de la ficha se cortó por max_tokens');
        throw new InternalServerErrorException(
          'Se cortó la lectura de la ficha. Probá sacando la foto más de cerca.',
        );
      }
      const block = res.content.find((b) => b.type === 'text');
      raw = block && block.type === 'text' ? block.text : '';
    } catch (err) {
      // El corte ya trae su propio mensaje; sin esto lo tapa el genérico.
      if (err instanceof HttpException) throw err;
      this.logger.error('Anthropic vision call failed', err as Error);
      throw new InternalServerErrorException(
        'No se pudo leer la ficha de la foto. Probá con una foto más nítida y derecha.',
      );
    }

    return this.parse(raw);
  }

  // The prompt asks for bare JSON, but be defensive about code fences / stray text.
  private parse(raw: string): ExtractedPatient {
    let jsonText = raw.trim();
    const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) jsonText = fenced[1].trim();
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start === -1 || end === -1) return {};
    jsonText = jsonText.slice(start, end + 1);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      return {};
    }

    const out: ExtractedPatient = {};
    const keys: (keyof ExtractedPatient)[] = [
      'name',
      'lastName',
      'birthDate',
      'age',
      'dni',
      'phone',
      'email',
      'obraSocial',
      'address',
      'locality',
      'notes',
    ];
    for (const k of keys) {
      const v = data[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return this.descartarFechaImposible(out);
  }

  /**
   * Una fecha de nacimiento mal leída es peor que ninguna.
   *
   * El formulario calcula la edad desde la fecha, así que una fecha mala no
   * se queda quieta en su casillero: pisa la edad que el papel traía bien
   * escrita. Caso real: el año estaba borroneado, el modelo leyó "2026-06-12"
   * y el alta quedó con 0 años en una ficha que dice 13.
   *
   * No alcanza con rechazar fechas futuras —esa era de cuatro meses atrás—.
   * Lo que la delata es que no cierra con la edad escrita al lado, pero la
   * comparación no es simétrica:
   *
   *  · Si la fecha da MÁS años que la edad escrita, está bien. La edad del
   *    papel es de cuando se abrió la ficha y envejece sola: una ficha de hace
   *    diez años dice 13 y el paciente hoy tiene 23. Rechazar eso tiraría
   *    fechas buenas de todas las fichas viejas, que son justo las que se
   *    están migrando.
   *  · Si da MENOS, no puede ser: nadie es hoy más joven que cuando lo
   *    anotaron. Ahí la mal leída es la fecha, y la edad escrita se queda.
   *
   * El año de gracia es para el cumpleaños sin cumplir y los redondeos.
   */
  private descartarFechaImposible(d: ExtractedPatient): ExtractedPatient {
    if (!d.birthDate) return d;

    const t = Date.parse(d.birthDate + 'T12:00:00Z');
    if (Number.isNaN(t)) {
      delete d.birthDate;
      return d;
    }
    const años = (Date.now() - t) / (365.25 * 24 * 3600 * 1000);
    if (años < 0 || años > 120) {
      this.logger.warn(`Fecha de nacimiento imposible: ${d.birthDate}`);
      delete d.birthDate;
      return d;
    }

    const escrita = Number((d.age ?? '').replace(/\D/g, ''));
    if (escrita > 0 && años < escrita - 1) {
      this.logger.warn(
        `Fecha ${d.birthDate} da ${Math.floor(años)} años pero la ficha dice ${escrita}; se descarta la fecha`,
      );
      delete d.birthDate;
    }
    return d;
  }
}
