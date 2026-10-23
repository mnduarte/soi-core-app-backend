import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { FichaScanService } from './ficha-scan.service';
import { PacienteDictadoService } from './paciente-dictado.service';
import { Patient, PatientSchema } from './schemas/patient.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Patient.name, schema: PatientSchema }]),
  ],
  controllers: [PatientsController],
  providers: [PatientsService, FichaScanService, PacienteDictadoService],
  exports: [PatientsService, MongooseModule],
})
export class PatientsModule {}
