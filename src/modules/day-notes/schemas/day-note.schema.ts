import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BaseEntity } from '../../../common/base/base.entity';

export type DayNoteDocument = HydratedDocument<DayNote>;

// Un documento por clínica y por día: las notas libres del día y la lista de
// prioridades (checklist) que se ven al costado de la libreta.
@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class DayNote extends BaseEntity {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  // Día en formato 'YYYY-MM-DD' (fecha local de la clínica, sin hora).
  @Prop({ required: true })
  day: string;

  @Prop()
  notes?: string;

  @Prop({
    type: [{ text: String, done: { type: Boolean, default: false } }],
    default: [],
  })
  priorities: { text: string; done: boolean }[];
}

export const DayNoteSchema = SchemaFactory.createForClass(DayNote);

DayNoteSchema.index(
  { clinicId: 1, day: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
