import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Clinic, ClinicSchema } from '../clinics/schemas/clinic.schema';
import { RefreshToken, RefreshTokenSchema } from './schemas/refresh-token.schema';
import { Invitation, InvitationSchema } from '../invitations/schemas/invitation.schema';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_USER_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_USER_EXPIRES_IN', '15m') as any },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Clinic.name, schema: ClinicSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: Invitation.name, schema: InvitationSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtStrategy, JwtModule],
})
export class AuthModule {}
