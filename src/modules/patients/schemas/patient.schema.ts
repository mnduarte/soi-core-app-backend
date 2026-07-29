import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type PatientDocument = HydratedDocument<Patient>;

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Patient extends BaseEntity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  // El nombre se carga en un solo campo en el front (splitName parte por el
  // primer espacio). Un paciente de un solo nombre ("Bruno") queda con lastName
  // vacío, así que NO puede ser required — Mongoose rechaza '' en un String
  // required y tiraba 500 al crear desde el modal completo.
  @Prop({ default: '' })
  lastName: string;

  @Prop()
  dni?: string;

  // Fecha de nacimiento queda para datos históricos / lectura de fichas viejas,
  // pero la carga rápida del consultorio usa `age` (el doctor tipea la edad).
  @Prop()
  birthDate?: Date;

  @Prop()
  age?: number;

  @Prop()
  phone?: string;

  @Prop()
  email?: string;

  @Prop()
  address?: string;

  @Prop()
  locality?: string;

  @Prop()
  obraSocial?: string;

  @Prop()
  nAfiliado?: string;

  @Prop({ default: false })
  isActive: boolean;

  @Prop({ type: Object })
  medicalHistory?: {
    allergies?: string[];
    conditions?: string[];
    medications?: string[];
    notes?: string;
  };
}

export const PatientSchema = SchemaFactory.createForClass(Patient);

PatientSchema.index({ clinicId: 1, deletedAt: 1 });
// DNI: índice no único (se permiten duplicados; se reconcilian desde la lista).
PatientSchema.index({ clinicId: 1, dni: 1 });
PatientSchema.index(
  {
    clinicId: 1,
    name: 'text',
    lastName: 'text',
    dni: 'text',
    phone: 'text',
    email: 'text',
  },
  { name: 'patient_text_search' },
);
