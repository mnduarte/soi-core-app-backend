import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type UserDocument = User & Document;

export enum UserRole {
  OWNER = 'OWNER',
  MEMBER = 'MEMBER',
}

// Honorific shown before the name in the UI (login greeting + sidebar).
// ASSISTANT → no prefix. Set per user from the backoffice.
export enum UserTitle {
  DR = 'DR',
  DRA = 'DRA',
  NONE = 'NONE',
}

export class ClinicalProfile {
  /** Matrícula profesional. */
  @Prop()
  license?: string;

  /** Documento del profesional. Va acá y no en el usuario porque solo
   *  importa para la documentación clínica que lo identifica. */
  @Prop()
  dni?: string;

  /** Firma del profesional en data URI, dibujada una sola vez en el perfil.
   *  Se estampa en los consentimientos: un consentimiento informado lo firman
   *  los dos, no solo el paciente. */
  @Prop()
  signaturePng?: string;

  @Prop()
  specialty?: string;

  @Prop()
  agendaColor?: string;
}

/**
 * Ayudas de primera vez ya vistas por esta persona.
 *
 * Va en el USUARIO y no en el navegador porque las ayudas son por persona, no
 * por dispositivo: el mismo odontólogo abre la app en la tablet del
 * consultorio, en su teléfono y en la computadora del escritorio, y con el
 * estado en `localStorage` el recorrido volvía a empezar en cada uno.
 *
 * Es un CONJUNTO DE BANDERAS, no un paso dentro de un recorrido: `vistas`
 * tiene el ID de cada grupo de globos que cerró con "Entendido". Por eso
 * agregar una ayuda nueva más adelante no reabre las viejas — es un ID que no
 * está en la lista, y los que sí están siguen marcados.
 */
export class TourState {
  /** IDs de los grupos cerrados con "Entendido". */
  @Prop({ type: [String], default: [] })
  vistas: string[];

  /**
   * Cuántas veces hizo cada cosa: `turnos` anotados, `trabajos` cargados.
   * Hay ayudas que no van la primera vez sino la segunda (el dictado: primero
   * que entienda la forma larga). Mapa libre y no un campo por cosa, así cada
   * pantalla nueva trae su propia cuenta sin cambiar el formato guardado.
   */
  @Prop({ type: Object, default: {} })
  contadores: Record<string, number>;
}

@Schema({ collection: 'users', timestamps: true })
export class User extends BaseEntity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  // Username for clinic-scoped login (typically === clinic.slug for OWNER
  // users created from the backoffice). Optional because legacy users
  // created via invitation flow only have email.
  @Prop({ lowercase: true, trim: true })
  username?: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  name: string;

  @Prop({ enum: UserTitle, default: UserTitle.NONE })
  title: UserTitle;

  @Prop({ enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @Prop({ default: false })
  isClinical: boolean;

  @Prop({ type: Object })
  clinicalProfile?: ClinicalProfile;

  @Prop()
  lastLoginAt?: Date;

  @Prop({ type: Object })
  tour?: TourState;

  // Set to true when an admin creates the account or resets credentials.
  // Forces the user through a "create your password" flow on first login.
  @Prop({ default: false })
  mustChangePassword: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  { clinicId: 1, email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
UserSchema.index(
  { clinicId: 1, username: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, username: { $type: 'string' } },
  },
);
UserSchema.index({ clinicId: 1, isClinical: 1 });
