import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClinicalEntriesService } from './clinical-entries.service';
import { ClinicalEntriesController } from './clinical-entries.controller';
import { ClinicalEntry, ClinicalEntrySchema } from './schemas/clinical-entry.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ClinicalEntry.name, schema: ClinicalEntrySchema }]),
  ],
  controllers: [ClinicalEntriesController],
  providers: [ClinicalEntriesService],
  exports: [ClinicalEntriesService],
})
export class ClinicalEntriesModule {}
