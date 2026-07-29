import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DayNote, DayNoteDocument } from './schemas/day-note.schema';
import { SaveDayNoteDto } from './dto/save-day-note.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class DayNotesService {
  constructor(
    @InjectModel(DayNote.name) private dayNoteModel: Model<DayNoteDocument>,
  ) {}

  // Devuelve las notas del día pedido (o una forma vacía si todavía no hay).
  async get(clinicId: string, day?: string) {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException('Fecha inválida (YYYY-MM-DD)');
    }
    const doc = await this.dayNoteModel
      .findOne({ clinicId: new Types.ObjectId(clinicId), day, deletedAt: null })
      .exec();
    return doc ?? { day, notes: '', priorities: [] };
  }

  // Upsert: un solo documento por clínica + día.
  async save(clinicId: string, dto: SaveDayNoteDto, requester: JwtPayload) {
    const priorities = (dto.priorities ?? []).map((p) => ({
      text: p.text,
      done: p.done ?? false,
    }));

    return this.dayNoteModel
      .findOneAndUpdate(
        {
          clinicId: new Types.ObjectId(clinicId),
          day: dto.day,
          deletedAt: null,
        },
        {
          $set: {
            notes: dto.notes ?? '',
            priorities,
            updatedAt: new Date(),
            updatedBy: new Types.ObjectId(requester.sub),
          },
          $setOnInsert: {
            clinicId: new Types.ObjectId(clinicId),
            day: dto.day,
            createdBy: new Types.ObjectId(requester.sub),
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }
}
