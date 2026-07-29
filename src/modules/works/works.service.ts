import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Work, WorkDocument, WorkStatus } from './schemas/work.schema';
import { CreateWorkDto, UpdateWorkDto } from './dto/work.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

// Estados que cuentan como "por hacer" (plan de tratamiento): todo lo que no es
// COMPLETED ni CANCELLED.
const PENDING_STATUSES = [
  WorkStatus.PROPOSED,
  WorkStatus.SCHEDULED,
  WorkStatus.IN_PROGRESS,
  WorkStatus.RECURRENT,
];

@Injectable()
export class WorksService {
  constructor(@InjectModel(Work.name) private workModel: Model<WorkDocument>) {}

  async create(clinicId: string, dto: CreateWorkDto, requester: JwtPayload) {
    const status = dto.status ?? WorkStatus.PROPOSED;
    return this.workModel.create({
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(dto.patientId),
      description: dto.description,
      toothNumber: dto.toothNumber,
      surface: dto.surface,
      status,
      price: dto.price ?? 0,
      estimatedDate: dto.estimatedDate
        ? new Date(dto.estimatedDate)
        : undefined,
      // El backend sella completedAt si se crea ya hecho (no confía en el cliente).
      completedAt: status === WorkStatus.COMPLETED ? new Date() : undefined,
      notes: dto.notes,
      createdBy: new Types.ObjectId(requester.sub),
    });
  }

  // Lista de trabajos de un paciente. `status`: 'pending' (plan de tratamiento),
  // 'done' (historial de hechos, ordenado por fecha de realización) o un estado
  // puntual; `q` busca texto/monto; `limit` pagina server-side el historial.
  async findAll(
    clinicId: string,
    patientId: string,
    opts?: {
      status?: string;
      q?: string;
      limit?: number;
      from?: string;
      to?: string;
    },
  ) {
    const filter: Record<string, unknown> = {
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(patientId),
      deletedAt: null,
    };

    let sort: Record<string, 1 | -1> = { createdAt: -1 };
    // `dateField` es sobre el que aplica el rango from/to: en 'done' filtramos por
    // fecha de realización (completedAt), en el resto por alta (createdAt).
    let dateField = 'createdAt';
    if (opts?.status === 'done') {
      filter.status = WorkStatus.COMPLETED;
      sort = { completedAt: -1 };
      dateField = 'completedAt';
    } else if (opts?.status === 'pending') {
      filter.status = { $in: PENDING_STATUSES };
    } else if (opts?.status) {
      filter.status = opts.status;
    }

    // Rango de fecha (inputs date-only YYYY-MM-DD): 'from' al inicio del día y
    // 'to' al final, interpretados en hora local del server para no perder el día.
    if (opts?.from || opts?.to) {
      const range: Record<string, Date> = {};
      if (opts.from) range.$gte = new Date(`${opts.from}T00:00:00`);
      if (opts.to) range.$lte = new Date(`${opts.to}T23:59:59.999`);
      filter[dateField] = range;
    }

    if (opts?.q?.trim()) {
      const q = opts.q.trim();
      const or: Record<string, unknown>[] = [
        { description: { $regex: q, $options: 'i' } },
        { toothNumber: { $regex: q, $options: 'i' } },
      ];
      const n = Number(q.replace(/[^\d]/g, ''));
      if (n) or.push({ price: n });
      filter.$or = or;
    }

    const query = this.workModel.find(filter).sort(sort);
    if (opts?.limit && opts.limit > 0) query.limit(opts.limit);
    return query.exec();
  }

  // Resumen para la barra "Falta cobrar": total realizado (Σ precio de HECHOS),
  // total/contador de pendientes y contador de hechos, todo en un aggregate.
  async summary(clinicId: string, patientId: string) {
    const [row] = await this.workModel.aggregate<{
      realizado: number;
      hechosCount: number;
      pendienteTotal: number;
      pendienteCount: number;
    }>([
      {
        $match: {
          clinicId: new Types.ObjectId(clinicId),
          patientId: new Types.ObjectId(patientId),
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          realizado: {
            $sum: {
              $cond: [{ $eq: ['$status', WorkStatus.COMPLETED] }, '$price', 0],
            },
          },
          hechosCount: {
            $sum: {
              $cond: [{ $eq: ['$status', WorkStatus.COMPLETED] }, 1, 0],
            },
          },
          pendienteTotal: {
            $sum: {
              $cond: [{ $in: ['$status', PENDING_STATUSES] }, '$price', 0],
            },
          },
          pendienteCount: {
            $sum: {
              $cond: [{ $in: ['$status', PENDING_STATUSES] }, 1, 0],
            },
          },
        },
      },
    ]);

    return {
      realizado: row?.realizado ?? 0,
      hechosCount: row?.hechosCount ?? 0,
      pendienteTotal: row?.pendienteTotal ?? 0,
      pendienteCount: row?.pendienteCount ?? 0,
    };
  }

  async update(
    clinicId: string,
    id: string,
    dto: UpdateWorkDto,
    requester: JwtPayload,
  ) {
    const work = await this.workModel
      .findOne({
        _id: new Types.ObjectId(id),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .exec();
    if (!work) throw new NotFoundException('Trabajo no encontrado');

    const wasComplete = work.status === WorkStatus.COMPLETED;
    // Asignación explícita por campo, NO spread del DTO: con `transform: true`
    // en el ValidationPipe global el DTO trae todas las opcionales como
    // `undefined`, y un spread pisaría description/price → null.
    if (dto.description !== undefined) work.description = dto.description;
    if (dto.toothNumber !== undefined) work.toothNumber = dto.toothNumber;
    if (dto.surface !== undefined) work.surface = dto.surface;
    if (dto.status !== undefined) work.status = dto.status;
    if (dto.price !== undefined) work.price = dto.price;
    if (dto.notes !== undefined) work.notes = dto.notes;
    if (dto.estimatedDate !== undefined) {
      work.estimatedDate = new Date(dto.estimatedDate);
    }

    if (dto.status !== undefined) {
      const isComplete = dto.status === WorkStatus.COMPLETED;
      if (isComplete && !wasComplete) work.completedAt = new Date();
      else if (!isComplete && wasComplete) work.completedAt = undefined;
    }

    work.updatedBy = new Types.ObjectId(requester.sub);
    return work.save();
  }

  async softDelete(clinicId: string, id: string, requester: JwtPayload) {
    const work = await this.workModel
      .findOne({
        _id: new Types.ObjectId(id),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .exec();
    if (!work) throw new NotFoundException('Trabajo no encontrado');
    work.deletedAt = new Date();
    work.deletedBy = new Types.ObjectId(requester.sub);
    await work.save();
    return { ok: true };
  }
}
