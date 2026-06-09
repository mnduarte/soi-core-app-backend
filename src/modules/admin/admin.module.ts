import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { Clinic, ClinicSchema } from '../clinics/schemas/clinic.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Banner, BannerSchema } from '../banners/schemas/banner.schema';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import { AdminSettings, AdminSettingsSchema } from './schemas/admin-settings.schema';
import {
  PasswordResetRequest,
  PasswordResetRequestSchema,
} from './schemas/password-reset-request.schema';
import { TelegramService } from './telegram.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Clinic.name, schema: ClinicSchema },
      { name: User.name, schema: UserSchema },
      { name: Banner.name, schema: BannerSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: AdminSettings.name, schema: AdminSettingsSchema },
      { name: PasswordResetRequest.name, schema: PasswordResetRequestSchema },
    ]),
    // Same JWT secret/expiry as the user auth module so the impersonation
    // token validates through the existing JwtAuthGuard — we just inject an
    // `imp: true` flag in the payload.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_USER_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_USER_EXPIRES_IN', '15m') as never,
        },
      }),
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, TelegramService],
  // Exported so AuthModule can fire the Telegram + persist the request row
  // when a user submits the public forgot-password form.
  exports: [
    MongooseModule.forFeature([
      { name: PasswordResetRequest.name, schema: PasswordResetRequestSchema },
    ]),
    TelegramService,
  ],
})
export class AdminModule {}
