import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { ClinicsModule } from './modules/clinics/clinics.module';
import { UsersModule } from './modules/users/users.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { PatientsModule } from './modules/patients/patients.module';
import { OdontogramsModule } from './modules/odontograms/odontograms.module';
import { TreatmentPlansModule } from './modules/treatment-plans/treatment-plans.module';
import { ClinicalEntriesModule } from './modules/clinical-entries/clinical-entries.module';
import { PriceCatalogModule } from './modules/price-catalog/price-catalog.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { GalleryModule } from './modules/gallery/gallery.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { BannersModule } from './modules/banners/banners.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT', 10),
        },
      ],
      inject: [ConfigService],
    }),
    AuthModule,
    ClinicsModule,
    UsersModule,
    InvitationsModule,
    PatientsModule,
    OdontogramsModule,
    TreatmentPlansModule,
    ClinicalEntriesModule,
    PriceCatalogModule,
    AppointmentsModule,
    GalleryModule,
    TransactionsModule,
    BannersModule,
    AdminAuthModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
