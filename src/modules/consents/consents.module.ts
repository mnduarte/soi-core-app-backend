import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConsentsService } from './consents.service';
import { ConsentsController } from './consents.controller';
import { Consent, ConsentSchema } from './schemas/consent.schema';
import { Work, WorkSchema } from '../works/schemas/work.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Consent.name, schema: ConsentSchema },
      { name: Work.name, schema: WorkSchema },
    ]),
  ],
  controllers: [ConsentsController],
  providers: [ConsentsService],
  exports: [ConsentsService],
})
export class ConsentsModule {}
