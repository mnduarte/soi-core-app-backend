import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { Clinic, ClinicSchema } from '../clinics/schemas/clinic.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Banner, BannerSchema } from '../banners/schemas/banner.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Clinic.name, schema: ClinicSchema },
      { name: User.name, schema: UserSchema },
      { name: Banner.name, schema: BannerSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
