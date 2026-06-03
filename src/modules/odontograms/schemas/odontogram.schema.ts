import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OdontogramDocument = HydratedDocument<Odontogram>;

// Two-color convention from the printed ficha used by the clinic:
//   EXISTING (red)  — what's already there: existing fillings, crowns, missing
//                     teeth — the consolidated current state.
//   REQUIRED (blue) — diagnostic findings that translate into plan items
//                     (caries to treat, endodoncia to do, etc.).
// "En curso" is a state of the plan item, not the tooth — kept out of here.
export enum ToothConditionStatus {
  EXISTING = 'EXISTING',
  REQUIRED = 'REQUIRED',
}

// Five surfaces per tooth plus "all" for whole-tooth conditions
// (extracción, corona, ausente, endodoncia, implante, etc.). M=mesial,
// D=distal, V=vestibular/bucal, L=lingual/palatina, O=oclusal/incisal.
export class ToothCondition {
  @Prop({ required: true })
  surface: string;

  @Prop({ required: true })
  condition: string;

  @Prop({ type: String, enum: ToothConditionStatus, default: ToothConditionStatus.REQUIRED })
  status: ToothConditionStatus;

  @Prop()
  notes?: string;
}

export class ToothState {
  @Prop({ required: true })
  toothNumber: number;

  @Prop({ type: [ToothCondition], default: [] })
  conditions: ToothCondition[];

  @Prop()
  status?: string;

  @Prop()
  notes?: string;
}

export class OdontogramSnapshot {
  @Prop({ required: true })
  version: number;

  @Prop({ type: [Object], default: [] })
  teeth: ToothState[];

  @Prop({ required: true })
  createdAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Odontogram {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Clinic' })
  clinicId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Patient' })
  patientId: Types.ObjectId;

  @Prop({ type: [Object], default: [] })
  teeth: ToothState[];

  @Prop({ default: 1 })
  version: number;

  @Prop({ type: [OdontogramSnapshot], default: [] })
  snapshots: OdontogramSnapshot[];

  createdAt: Date;
  updatedAt: Date;
}

export const OdontogramSchema = SchemaFactory.createForClass(Odontogram);

OdontogramSchema.index(
  { clinicId: 1, patientId: 1 },
  { unique: true },
);
