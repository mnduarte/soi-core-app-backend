import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConsentsService } from './consents.service';
import { ConsentsController } from './consents.controller';
import { PublicConsentsController } from './public-consents.controller';
import { Consent, ConsentSchema } from './schemas/consent.schema';
import { Work, WorkSchema } from '../works/schemas/work.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Consent.name, schema: ConsentSchema },
      { name: Work.name, schema: WorkSchema },
      { name: User.name, schema: UserSchema },
      { name: Patient.name, schema: PatientSchema },
    ]),
  ],
  controllers: [ConsentsController, PublicConsentsController],
  providers: [ConsentsService],
  exports: [ConsentsService],
})
export class ConsentsModule {}
