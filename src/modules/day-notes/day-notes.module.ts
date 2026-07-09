import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DayNotesService } from './day-notes.service';
import { DayNotesController } from './day-notes.controller';
import { DayNote, DayNoteSchema } from './schemas/day-note.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DayNote.name, schema: DayNoteSchema }]),
  ],
  controllers: [DayNotesController],
  providers: [DayNotesService],
})
export class DayNotesModule {}
