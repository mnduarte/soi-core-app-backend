import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Transaction, TransactionDocument, TransactionType } from './schemas/transaction.schema';
import { CreateTransactionDto } from './dto/transaction.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  async create(clinicId: string, dto: CreateTransactionDto, requester: JwtPayload) {
    return this.transactionModel.create({
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(dto.patientId),
      type: TransactionType.PAYMENT,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      description: dto.description,
      createdBy: new Types.ObjectId(requester.sub),
    });
  }

  async findAll(clinicId: string, patientId?: string) {
    const filter: Record<string, unknown> = {
      clinicId: new Types.ObjectId(clinicId),
    };
    if (patientId) filter.patientId = new Types.ObjectId(patientId);
    return this.transactionModel.find(filter).sort({ createdAt: -1 }).exec();
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
          total: {
            $sum: {
              $cond: [
                { $eq: ['$type', TransactionType.PAYMENT] },
                '$amount',
                { $multiply: ['$amount', -1] },
              ],
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

        if (!original) throw new NotFoundException('Transacción no encontrada o ya anulada');
        if (original.type === TransactionType.VOID) {
          throw new BadRequestException('No se puede anular una transacción de anulación');
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
