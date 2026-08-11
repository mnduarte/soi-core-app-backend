import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Patient, PatientDocument } from './schemas/patient.schema';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { ScanFichaDto } from './dto/scan-ficha.dto';
import { QuickCreatePatientDto } from './dto/quick-create-patient.dto';
import { FichaScanService } from './ficha-scan.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class PatientsService {
  constructor(
    @InjectModel(Patient.name) private patientModel: Model<PatientDocument>,
    private readonly fichaScan: FichaScanService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // Borrado físico del paciente + cascade de todo lo asociado (turnos, cuenta
  // corriente, odontograma, evoluciones, plan). Se usa para limpiar duplicados
  // cargados por error. Decisión de producto explícita (el resto es soft delete).
  async hardDelete(clinicId: string, patientId: string) {
    const cid = new Types.ObjectId(clinicId);
    const pid = new Types.ObjectId(patientId);
    const patient = await this.patientModel
      .findOne({ _id: pid, clinicId: cid })
      .exec();
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const filter = { clinicId: cid, patientId: pid };
    const related = [
      'Appointment',
      'Transaction',
      'Odontogram',
      'ClinicalEntry',
      'TreatmentPlan',
    ];
    await Promise.all(
      related.map((name) => {
        const model = this.connection.models[name];
        return model ? model.deleteMany(filter).exec() : Promise.resolve();
      }),
    );
    await this.patientModel.deleteOne({ _id: pid, clinicId: cid }).exec();
    return { ok: true };
  }

  // Reads a paper record photo, returns the extracted fields plus a possible
  // existing patient match (by DNI → phone → name+lastName, scoped to the
  // clinic). Matches ACTIVE patients first; if none, looks among SOFT-DELETED
  // ones so the UI can offer to restore (with full history) instead of creating
  // a duplicate. `deleted` flags which case it is.
  async scanFicha(clinicId: string, dto: ScanFichaDto) {
    const extracted = await this.fichaScan.extract(dto.image, dto.mediaType);
    const cid = new Types.ObjectId(clinicId);

    const findMatch = async (q: Record<string, unknown>) => {
      const active = await this.patientModel
        .findOne({ clinicId: cid, ...q, deletedAt: null })
        .select('_id name lastName')
        .lean();
      if (active) return { ...active, deleted: false };
      const deleted = await this.patientModel
        .findOne({ clinicId: cid, ...q, deletedAt: { $ne: null } })
        .select('_id name lastName')
        .lean();
      if (deleted) return { ...deleted, deleted: true };
      return null;
    };

    let match: {
      _id: Types.ObjectId;
      name: string;
      lastName: string;
      deleted: boolean;
    } | null = null;
    if (extracted.dni) match = await findMatch({ dni: extracted.dni });
    if (!match && extracted.phone)
      match = await findMatch({ phone: extracted.phone });
    if (!match && extracted.name && extracted.lastName) {
      match = await findMatch({
        name: new RegExp(`^${escapeRegex(extracted.name)}$`, 'i'),
        lastName: new RegExp(`^${escapeRegex(extracted.lastName)}$`, 'i'),
      });
    }

    return {
      extracted,
      existing: match
        ? {
            _id: match._id.toString(),
            name: match.name,
            lastName: match.lastName,
            deleted: match.deleted,
          }
        : null,
    };
  }

  // Revive a soft-deleted patient (keeps all its history). Looks it up without
  // the deletedAt:null filter on purpose.
  async restore(clinicId: string, patientId: string) {
    const patient = await this.patientModel
      .findOne({
        _id: new Types.ObjectId(patientId),
        clinicId: new Types.ObjectId(clinicId),
      })
      .exec();
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    await this.patientModel
      .updateOne(
        { _id: patient._id },
        { $unset: { deletedAt: '', deletedBy: '' } },
      )
      .exec();
    return { ok: true };
  }

  async create(clinicId: string, dto: CreatePatientDto, requester: JwtPayload) {
    // Nota: NO bloqueamos por DNI repetido. El front avisa si ya existe, pero se
    // permite cargar (puede ser el correcto) y se reconcilia después desde la
    // lista de pacientes (banner de duplicados).
    return this.patientModel.create({
      ...dto,
      clinicId: new Types.ObjectId(clinicId),
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      isActive: dto.isActive ?? true,
      createdBy: new Types.ObjectId(requester.sub),
    });
  }

  // Crear paciente rápido desde la agenda: solo nombre, se splitea automáticamente.
  async quickCreate(
    clinicId: string,
    dto: QuickCreatePatientDto,
    requester: JwtPayload,
  ) {
    const parts = dto.fullName.trim().split(/\s+/);
    const name = parts[0];
    // Sin apellido queda vacío (no '—'): el schema ya no lo exige y el display
    // concatena name+lastName, así un solo nombre se ve limpio ("Bruno").
    const lastName = parts.slice(1).join(' ');
    return this.patientModel.create({
      name,
      lastName,
      clinicId: new Types.ObjectId(clinicId),
      isActive: true,
      createdBy: new Types.ObjectId(requester.sub),
    });
  }

  async findAll(clinicId: string, search?: string) {
    const filter: Record<string, unknown> = {
      clinicId: new Types.ObjectId(clinicId),
      deletedAt: null,
    };

    if (search?.trim()) {
      // Búsqueda parcial (substring) por cada palabra: cada término tiene que
      // matchear al menos un campo. Así "luc" encuentra "Lucia" y "lucia fer"
      // encuentra "Lucia Fernandes". ($text solo matchea palabras completas.)
      const tokens = search.trim().split(/\s+/).map(escapeRegex);
      filter.$and = tokens.map((tok) => {
        const rx = new RegExp(tok, 'i');
        return {
          $or: [
            { name: rx },
            { lastName: rx },
            { dni: rx },
            { phone: rx },
            { email: rx },
          ],
        };
      });
    }

    // Las estadísticas NO dependen de qué pacientes devuelva el find (se agrupan
    // por patientId sobre toda la clínica), así que se lanzan en paralelo con él.
    // Contra Atlas el costo dominante es la latencia de red, no el cálculo: en
    // serie eran dos viajes encadenados, así queda uno solo.
    const [patients, stats] = await Promise.all([
      this.patientModel.find(filter).sort({ lastName: 1, name: 1 }).exec(),
      this.listStats(clinicId),
    ]);

    return patients.map((p) => {
      const id = String(p._id);
      const v = stats.visits.get(id);
      const realizado = stats.done.get(id) ?? 0;
      const pagado = stats.paid.get(id) ?? 0;
      return {
        ...p.toObject(),
        lastVisitAt: v?.lastVisitAt ?? null,
        appointmentsCount: v?.count ?? 0,
        balance: realizado - pagado,
      };
    });
  }

  // Estadísticas del listado (última visita, turnos y saldo) como campos
  // CALCULADOS, no persistidos. Son 3 aggregates scopeados a la CLÍNICA y
  // agrupados por paciente — no uno por paciente —, así que el costo no crece
  // con la cantidad de fichas. Los tres van por índice.
  //
  // El saldo sigue el modelo "Falta cobrar" de la ficha:
  //   saldo = Σ(precio de trabajos HECHOS) − Σ(pagos)   → > 0 significa que debe.
  // Se ignoran los CHARGE legacy a propósito, para que la lista muestre
  // exactamente el mismo número que la ficha del paciente.
  private async listStats(clinicId: string) {
    const cid = new Types.ObjectId(clinicId);
    const now = new Date();

    const [visits, done, paid] = await Promise.all([
      // Turnos: total + fecha del último ya ocurrido (excluye cancelados).
      this.connection
        .collection('appointments')
        .aggregate([
          {
            $match: {
              clinicId: cid,
              deletedAt: null,
              status: { $nin: ['CANCELLED'] },
            },
          },
          {
            $group: {
              _id: '$patientId',
              count: { $sum: 1 },
              lastVisitAt: {
                $max: {
                  $cond: [{ $lte: ['$startsAt', now] }, '$startsAt', null],
                },
              },
            },
          },
        ])
        .toArray(),
      // Trabajos hechos → lo realizado (lo que se puede cobrar).
      this.connection
        .collection('works')
        .aggregate([
          { $match: { clinicId: cid, deletedAt: null, status: 'COMPLETED' } },
          { $group: { _id: '$patientId', total: { $sum: '$price' } } },
        ])
        .toArray(),
      // Pagos del paciente.
      this.connection
        .collection('transactions')
        .aggregate([
          { $match: { clinicId: cid, type: 'PAYMENT', voidedAt: null } },
          { $group: { _id: '$patientId', total: { $sum: '$amount' } } },
        ])
        .toArray(),
    ]);

    const totalsById = (rows: { _id: unknown; total: number }[]) =>
      new Map(rows.map((r) => [String(r._id), r.total]));

    return {
      visits: new Map(
        (visits as { _id: unknown; count: number; lastVisitAt: Date | null }[]).map((r) => [
          String(r._id),
          r,
        ]),
      ),
      done: totalsById(done as { _id: unknown; total: number }[]),
      paid: totalsById(paid as { _id: unknown; total: number }[]),
    };
  }

  async findById(clinicId: string, patientId: string) {
    const patient = await this.patientModel
      .findOne({
        _id: new Types.ObjectId(patientId),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .exec();
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return patient;
  }

  async update(
    clinicId: string,
    patientId: string,
    dto: UpdatePatientDto,
    requester: JwtPayload,
  ) {
    const patient = await this.findById(clinicId, patientId);

    Object.assign(patient, {
      ...dto,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : patient.birthDate,
    });
    patient.updatedAt = new Date();
    patient.updatedBy = new Types.ObjectId(requester.sub);
    return patient.save();
  }

  async softDelete(clinicId: string, patientId: string, requester: JwtPayload) {
    const patient = await this.findById(clinicId, patientId);
    patient.deletedAt = new Date();
    patient.deletedBy = new Types.ObjectId(requester.sub);
    return patient.save();
  }
}
