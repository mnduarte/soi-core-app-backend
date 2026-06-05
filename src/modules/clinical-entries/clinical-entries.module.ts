import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClinicalEntriesService } from './clinical-entries.service';
import { ClinicalEntriesController } from './clinical-entries.controller';
import { ClinicalEntry, ClinicalEntrySchema } from './schemas/clinical-entry.schema';
import { Appointment, AppointmentSchema } from '../appointments/schemas/appointment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClinicalEntry.name, schema: ClinicalEntrySchema },
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
  ],
  controllers: [ClinicalEntriesController],
  providers: [ClinicalEntriesService],
  exports: [ClinicalEntriesService],
})
export class ClinicalEntriesModule {}
