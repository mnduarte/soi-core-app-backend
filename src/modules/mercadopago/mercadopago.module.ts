import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MercadoPagoService } from './mercadopago.service';
import { MercadoPagoController } from './mercadopago.controller';
import { Clinic, ClinicSchema } from '../clinics/schemas/clinic.schema';
import {
  ClinicPayment,
  ClinicPaymentSchema,
} from '../admin/schemas/clinic-payment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Clinic.name, schema: ClinicSchema },
      { name: ClinicPayment.name, schema: ClinicPaymentSchema },
    ]),
  ],
  controllers: [MercadoPagoController],
  providers: [MercadoPagoService],
  // El módulo admin lo usa para los endpoints con AdminGuard (crear el link,
  // cancelar, resincronizar). El webhook público queda acá.
  exports: [MercadoPagoService],
})
export class MercadoPagoModule {}
