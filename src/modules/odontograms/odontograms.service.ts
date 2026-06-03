import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Odontogram,
  OdontogramDocument,
  ToothCondition,
  ToothConditionStatus,
  ToothState,
} from './schemas/odontogram.schema';
import { ApplyOpsDto, OdontogramOpDto } from './dto/odontogram-ops.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class OdontogramsService {
  constructor(
    @InjectModel(Odontogram.name) private odontogramModel: Model<OdontogramDocument>,
  ) {}

  async findOrCreate(clinicId: string, patientId: string): Promise<OdontogramDocument> {
    const existing = await this.odontogramModel
      .findOne({
        clinicId: new Types.ObjectId(clinicId),
        patientId: new Types.ObjectId(patientId),
      })
      .exec();

    if (existing) return existing;

    return this.odontogramModel.create({
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(patientId),
      teeth: [],
      version: 1,
    });
  }

  async applyOps(clinicId: string, patientId: string, dto: ApplyOpsDto, requester: JwtPayload) {
    const odontogram = await this.findOrCreate(clinicId, patientId);

    const teeth: ToothState[] = JSON.parse(JSON.stringify(odontogram.teeth));

    for (const op of dto.ops) {
      this.applyOp(teeth, op);
    }

    odontogram.teeth = teeth;
    odontogram.version += 1;

    if (dto.saveSnapshot) {
      odontogram.snapshots.push({
        version: odontogram.version,
        teeth: JSON.parse(JSON.stringify(teeth)),
        createdAt: new Date(),
        createdBy: new Types.ObjectId(requester.sub),
      });
    }

    return odontogram.save();
  }

  private applyOp(teeth: ToothState[], op: OdontogramOpDto): void {
    let tooth = teeth.find(t => t.toothNumber === op.toothNumber);

    if (!tooth) {
      tooth = { toothNumber: op.toothNumber, conditions: [] };
      teeth.push(tooth);
    }

    switch (op.type) {
      case 'set_condition':
        if (op.condition) {
          // The DTO marks status optional so older clients still validate;
          // server-side we always normalize to a defined status.
          const normalized: ToothCondition = {
            surface: op.condition.surface,
            condition: op.condition.condition,
            status: op.condition.status ?? ToothConditionStatus.REQUIRED,
            notes: op.condition.notes,
          };
          const idx = tooth.conditions.findIndex(c => c.surface === normalized.surface);
          if (idx >= 0) {
            tooth.conditions[idx] = normalized;
          } else {
            tooth.conditions.push(normalized);
          }
        }
        break;

      case 'remove_condition':
        if (op.surface) {
          tooth.conditions = tooth.conditions.filter(c => c.surface !== op.surface);
        }
        break;

      case 'set_status':
        tooth.status = op.status;
        break;

      case 'set_notes':
        tooth.notes = op.notes;
        break;
    }
  }

  async getSnapshots(clinicId: string, patientId: string) {
    const odontogram = await this.odontogramModel
      .findOne({
        clinicId: new Types.ObjectId(clinicId),
        patientId: new Types.ObjectId(patientId),
      })
      .select('snapshots version')
      .exec();

    if (!odontogram) throw new NotFoundException('Odontograma no encontrado');
    return odontogram.snapshots;
  }

  async saveSnapshot(clinicId: string, patientId: string, requester: JwtPayload) {
    const odontogram = await this.odontogramModel
      .findOne({
        clinicId: new Types.ObjectId(clinicId),
        patientId: new Types.ObjectId(patientId),
      })
      .exec();

    if (!odontogram) throw new NotFoundException('Odontograma no encontrado');

    odontogram.snapshots.push({
      version: odontogram.version,
      teeth: JSON.parse(JSON.stringify(odontogram.teeth)),
      createdAt: new Date(),
      createdBy: new Types.ObjectId(requester.sub),
    });

    return odontogram.save();
  }
}
