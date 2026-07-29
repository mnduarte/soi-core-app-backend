import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import {
  Transaction,
  TransactionDocument,
  TransactionType,
} from './schemas/transaction.schema';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  async create(
    clinicId: string,
    dto: CreateTransactionDto,
    requester: JwtPayload,
  ) {
    // El alta manual solo permite PAYMENT (cobro) o CHARGE (cargo). REFUND/VOID
    // son internos (se generan al anular).
    const type =
      dto.type === TransactionType.CHARGE
        ? TransactionType.CHARGE
        : TransactionType.PAYMENT;
    return this.transactionModel.create({
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(dto.patientId),
      type,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      description: dto.description,
      date: dto.date ? new Date(dto.date) : new Date(),
      createdBy: new Types.ObjectId(requester.sub),
    });
  }

  // Editar un movimiento de la cuenta corriente (ficha rápida). Solo aplica a
  // CHARGE/PAYMENT; los internos (REFUND/VOID) no se editan.
  async update(
    clinicId: string,
    transactionId: string,
    dto: UpdateTransactionDto,
    requester: JwtPayload,
  ) {
    const tx = await this.transactionModel
      .findOne({
        _id: new Types.ObjectId(transactionId),
        clinicId: new Types.ObjectId(clinicId),
      })
      .exec();
    if (!tx) throw new NotFoundException('Movimiento no encontrado');
    if (
      tx.type !== TransactionType.CHARGE &&
      tx.type !== TransactionType.PAYMENT
    ) {
      throw new BadRequestException('Este movimiento no se puede editar');
    }
    if (
      dto.type === TransactionType.CHARGE ||
      dto.type === TransactionType.PAYMENT
    ) {
      tx.type = dto.type;
    }
    if (dto.amount != null) tx.amount = dto.amount;
    if (dto.paymentMethod != null) tx.paymentMethod = dto.paymentMethod;
    if (dto.description != null) tx.description = dto.description;
    if (dto.date) tx.date = new Date(dto.date);
    tx.updatedBy = new Types.ObjectId(requester.sub);
    return tx.save();
  }

  // Borrado físico (la ficha rápida borra como se tacha en el cuaderno).
  async hardDelete(clinicId: string, transactionId: string) {
    const res = await this.transactionModel
      .deleteOne({
        _id: new Types.ObjectId(transactionId),
        clinicId: new Types.ObjectId(clinicId),
      })
      .exec();
    if (res.deletedCount === 0)
      throw new NotFoundException('Movimiento no encontrado');
    return { ok: true };
  }

  async findAll(
    clinicId: string,
    patientId?: string,
    opts?: {
      from?: string;
      to?: string;
      q?: string;
      type?: string;
      limit?: number;
    },
  ) {
    const filter: Record<string, unknown> = {
      clinicId: new Types.ObjectId(clinicId),
    };
    if (patientId) filter.patientId = new Types.ObjectId(patientId);
    if (opts?.type) filter.type = opts.type;

    // Rango de fechas sobre `date` (el modal de Pagos filtra por período).
    // Anclado a hora Argentina (UTC-3): el server corre en UTC pero el front
    // muestra las fechas en ART; sin el offset el borde de medianoche no coincide.
    if (opts?.from || opts?.to) {
      const range: Record<string, Date> = {};
      if (opts.from) range.$gte = new Date(`${opts.from}T00:00:00-03:00`);
      if (opts.to) range.$lte = new Date(`${opts.to}T23:59:59.999-03:00`);
      filter.date = range;
    }

    // Texto libre: método (efectivo/transferencia/…), descripción o monto exacto.
    if (opts?.q?.trim()) {
      const q = opts.q.trim();
      const or: Record<string, unknown>[] = [
        { description: { $regex: q, $options: 'i' } },
        { paymentMethod: { $regex: q, $options: 'i' } },
      ];
      const n = Number(q.replace(/[^\d]/g, ''));
      if (n) or.push({ amount: n });
      filter.$or = or;
    }

    const query = this.transactionModel.find(filter).sort({ date: -1 });
    if (opts?.limit && opts.limit > 0) query.limit(opts.limit);
    return query.exec();
  }

  async getBalance(clinicId: string, patientId: string) {
    const result = await this.transactionModel.aggregate([
      {
        $match: {
          clinicId: new Types.ObjectId(clinicId),
          patientId: new Types.ObjectId(patientId),
          voidedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          // Convención deuda-positiva: saldo > 0 = el paciente DEBE.
          //   CHARGE / REFUND → suman deuda    PAYMENT → resta    VOID → ignora
          // (los anulados ya quedan fuera por voidedAt: null)
          total: {
            $sum: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ['$type', TransactionType.PAYMENT] },
                    then: { $multiply: ['$amount', -1] },
                  },
                  {
                    case: { $eq: ['$type', TransactionType.CHARGE] },
                    then: '$amount',
                  },
                  {
                    case: { $eq: ['$type', TransactionType.REFUND] },
                    then: '$amount',
                  },
                ],
                default: 0,
              },
            },
          },
        },
      },
    ]);

    return { balance: result[0]?.total ?? 0 };
  }

  async void(clinicId: string, transactionId: string, requester: JwtPayload) {
    const session = await this.connection.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const original = await this.transactionModel
          .findOne({
            _id: new Types.ObjectId(transactionId),
            clinicId: new Types.ObjectId(clinicId),
            voidedAt: null,
          })
          .session(session)
          .exec();

        if (!original)
          throw new NotFoundException('Transacción no encontrada o ya anulada');
        if (original.type === TransactionType.VOID) {
          throw new BadRequestException(
            'No se puede anular una transacción de anulación',
          );
        }

        original.voidedAt = new Date();
        original.voidedBy = new Types.ObjectId(requester.sub);
        await original.save({ session });

        const inverse = await this.transactionModel.create(
          [
            {
              clinicId: new Types.ObjectId(clinicId),
              patientId: original.patientId,
              type: TransactionType.VOID,
              amount: original.amount,
              description: `Anulación de transacción ${transactionId}`,
              relatedTransactionId: original._id,
              createdBy: new Types.ObjectId(requester.sub),
            },
          ],
          { session },
        );

        return { original, inverse: inverse[0] };
      });

      return result;
    } finally {
      await session.endSession();
    }
  }
}
