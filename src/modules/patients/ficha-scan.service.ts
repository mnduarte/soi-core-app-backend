import {
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
- birthDate siempre en formato YYYY-MM-DD (si la ficha dice 12/06/2011, devolvé "2011-06-12").`;

@Injectable()
export class FichaScanService {
  private readonly logger = new Logger(FichaScanService.name);

  constructor(private readonly config: ConfigService) {}

  async extract(imageBase64: string, mediaType: string): Promise<ExtractedPatient> {
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
    // Cheapest capable vision model by default; bump to claude-sonnet-4-6 (or
    // claude-opus-4-8) via env if handwriting accuracy isn't enough.
    const model = this.config.get<string>('ANTHROPIC_VISION_MODEL') ?? 'claude-haiku-4-5';

    let raw: string;
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                  data: imageBase64,
                },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      });
      const block = res.content.find((b) => b.type === 'text');
      raw = block && block.type === 'text' ? block.text : '';
    } catch (err) {
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
    return out;
  }
}
