import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type ConsentDocument = HydratedDocument<Consent>;

export enum ConsentStatus {
  PENDING = 'PENDING',
  SIGNED = 'SIGNED',
}

/** De dónde salió la firma. `LINK` queda reservado para la fase 2. */
export enum ConsentOrigin {
  OFFICE = 'OFFICE',
  LINK = 'LINK',
  PAPER = 'PAPER',
}

/**
 * Un consentimiento informado de UN paciente.
 *
 * Lo que vuelve especial a esta colección frente al resto del sistema: una vez
 * firmado, el documento es **inmutable**. `finalText`, `dni`, `signedAt`,
 * `signaturePng` y `hash` no se tocan nunca más, ni siquiera con un PATCH del
 * dueño de la clínica. Un consentimiento que se puede editar después de
 * firmado no respalda nada.
 *
 * Por eso el texto se guarda **congelado** (`finalText`) y no por referencia a
 * la plantilla: si mañana el Dr. corrige la plantilla, lo que el paciente leyó
 * y firmó tiene que seguir diciendo exactamente lo que decía ese día.
 */
@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Consent extends BaseEntity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Patient' })
  patientId: Types.ObjectId;

  /** Id de la plantilla dentro de `clinic.settings.consentTemplates`. Es
   *  informativo: el texto que vale es `finalText`, no la plantilla. */
  @Prop()
  templateId?: string;

  /** Versión exacta de la plantilla de la que salió el texto. Junto con
   *  `finalText` congelado, permite probar no solo qué firmó el paciente
   *  sino de qué versión del documento salió. */
  @Prop()
  templateVersionId?: string;

  /** Número de versión ("v3"), para mostrarlo sin ir a buscar la plantilla. */
  @Prop()
  templateVersionN?: number;

  /** Nombre de la plantilla al momento de generarlo, para la lista. */
  @Prop({ required: true })
  templateName: string;

  /** Trabajo que documenta, si se vinculó a uno. Opcional: hay
   *  consentimientos generales que no cuelgan de ningún trabajo. */
  @Prop({ type: Types.ObjectId, ref: 'Work' })
  workId?: Types.ObjectId;

  /** El texto con las variables ya reemplazadas. Inmutable. */
  @Prop({ required: true })
  finalText: string;

  /** DNI con el que firmó. Se confirma en la pantalla de firma. */
  @Prop()
  dni?: string;

  @Prop({ type: String, enum: ConsentStatus, default: ConsentStatus.PENDING })
  status: ConsentStatus;

  @Prop({ type: String, enum: ConsentOrigin, default: ConsentOrigin.OFFICE })
  origin: ConsentOrigin;

  /** Profesional que lo generó y ante quien se firma. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  professionalId?: Types.ObjectId;

  /**
   * Identidad y firma del profesional, CONGELADAS al firmar.
   *
   * No se leen del usuario al mostrar el consentimiento: si mañana se cambia
   * la matrícula o se rehace la firma en el perfil, un documento ya firmado
   * tiene que seguir mostrando lo que mostraba ese día. Es la misma razón por
   * la que el texto se congela en vez de referenciar la plantilla.
   */
  @Prop()
  professionalName?: string;

  @Prop()
  professionalLicense?: string;

  @Prop()
  professionalDni?: string;

  @Prop()
  professionalSignaturePng?: string;

  @Prop()
  signedAt?: Date;

  /** PNG de la firma en data URI. Va adentro del documento y no en el
   *  almacenamiento de imágenes a propósito: el registro tiene que ser una
   *  sola cosa. Una firma pesa decenas de kB; partirla en dos lugares que
   *  pueden desincronizarse no compensa el ahorro. */
  @Prop()
  signaturePng?: string;

  /** SHA-256 de finalText + dni + signedAt. Se calcula EN EL SERVIDOR: un
   *  hash que manda el cliente no prueba nada. */
  @Prop()
  hash?: string;

  // --- Anulación.
  /**
   * Un consentimiento firmado no se borra: se anula.
   *
   * El documento sigue existiendo, se sigue pudiendo descargar y el PDF sale
   * con el sello ANULADO, pero deja de valer como consentimiento. Que conste
   * que existió y que se dio de baja —con quién y cuándo— es mejor respaldo
   * que un papel desaparecido.
   *
   * Estos campos NO rompen la inmutabilidad de arriba: `finalText`, `dni`,
   * `signedAt`, las firmas y el `hash` siguen intactos, así que lo que el
   * paciente firmó se puede seguir verificando igual que antes.
   */
  @Prop()
  annulledAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  annulledBy?: Types.ObjectId;

  @Prop({ maxlength: 300 })
  annulledReason?: string;

  // --- Firma por link (WhatsApp).
  /**
   * SHA-256 del token, nunca el token en claro.
   *
   * El token ES la credencial: quien tenga el link puede leer y firmar este
   * consentimiento. Guardando solo el hash, una filtración de la base no
   * entrega links usables. Se usa SHA-256 y no argon2 —que es lo que usa el
   * proyecto para contraseñas— justamente porque tiene que ser determinístico
   * para poder buscarlo por índice; y alcanza, porque el token es aleatorio de
   * 32 bytes y no algo que alguien pueda adivinar.
   */
  @Prop({ index: true, sparse: true })
  linkTokenHash?: string;

  @Prop()
  linkExpiresAt?: Date;
}

export const ConsentSchema = SchemaFactory.createForClass(Consent);

ConsentSchema.index({ clinicId: 1, patientId: 1, deletedAt: 1 });
ConsentSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 });
// Para el punto de aviso en la pestaña: "¿hay alguno sin firmar?".
ConsentSchema.index({ clinicId: 1, status: 1, deletedAt: 1 });
// Para marcar el trabajo con el sello FIRMADO en "Trabajos y pagos".
ConsentSchema.index({ clinicId: 1, workId: 1, deletedAt: 1 });
