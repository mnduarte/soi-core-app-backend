import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppointmentsService } from './appointments.service';
import { AgendaIntentService } from './agenda-intent.service';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import { AppointmentsController } from './appointments.controller';
import { Appointment, AppointmentSchema } from './schemas/appointment.schema';
import { Clinic, ClinicSchema } from '../clinics/schemas/clinic.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Clinic.name, schema: ClinicSchema },
      { name: Patient.name, schema: PatientSchema },
    ]),
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AgendaIntentService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
