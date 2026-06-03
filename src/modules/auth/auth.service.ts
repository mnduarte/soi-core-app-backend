import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { Clinic, ClinicDocument, SubscriptionStatus } from '../clinics/schemas/clinic.schema';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema';
import { Invitation, InvitationDocument } from '../invitations/schemas/invitation.schema';
import { LoginDto } from './dto/login.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { addDays } from 'date-fns';

function isReadonly(clinic: Clinic): boolean {
  if (clinic.status === SubscriptionStatus.SUSPENDED) return true;
  if (clinic.subscriptionEndsAt && clinic.subscriptionEndsAt < new Date()) {
    const graceEnd = addDays(clinic.subscriptionEndsAt, 7);
    return new Date() < graceEnd;
  }
  return false;
}

function isFullyBlocked(clinic: Clinic): boolean {
  if (clinic.subscriptionEndsAt && clinic.subscriptionEndsAt < new Date()) {
    const graceEnd = addDays(clinic.subscriptionEndsAt, 7);
    return new Date() >= graceEnd;
  }
  return false;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Clinic.name) private clinicModel: Model<ClinicDocument>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(Invitation.name)
    private invitationModel: Model<InvitationDocument>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase(), deletedAt: null })
      .exec();

    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const clinic = await this.clinicModel.findById(user.clinicId).exec();
    if (!clinic) throw new UnauthorizedException('Consultorio no encontrado');

    if (isFullyBlocked(clinic)) {
      throw new ForbiddenException(
        'La suscripción venció. Contactar al administrador.',
      );
    }

    user.lastLoginAt = new Date();
    await user.save();

    return this.buildAuthResponse(user, clinic, ipAddress, userAgent);
  }

  async refresh(rawToken: string, ipAddress?: string, userAgent?: string) {
    // Find all non-revoked tokens and hash-compare
    const candidates = await this.refreshTokenModel
      .find({ revokedAt: null, expiresAt: { $gt: new Date() } })
      .exec();

    let matched: RefreshTokenDocument | null = null;
    for (const candidate of candidates) {
      const ok = await argon2.verify(candidate.tokenHash, rawToken);
      if (ok) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      // Could be a stolen token — check if it was already revoked
      const revokedCandidates = await this.refreshTokenModel
        .find({ revokedAt: { $ne: null } })
        .exec();

      for (const candidate of revokedCandidates) {
        const ok = await argon2.verify(candidate.tokenHash, rawToken);
        if (ok) {
          // Token reuse detected — revoke all tokens for this user
          await this.refreshTokenModel.updateMany(
            { userId: candidate.userId },
            { revokedAt: new Date() },
          );
          throw new UnauthorizedException('Token reutilizado. Sesión revocada.');
        }
      }

      throw new UnauthorizedException('Refresh token inválido');
    }

    // Revoke the used token
    matched.revokedAt = new Date();
    await matched.save();

    const user = await this.userModel.findById(matched.userId).exec();
    if (!user) throw new UnauthorizedException();

    const clinic = await this.clinicModel.findById(matched.clinicId).exec();
    if (!clinic) throw new UnauthorizedException();

    if (isFullyBlocked(clinic)) {
      throw new ForbiddenException('La suscripción venció.');
    }

    const result = await this.buildAuthResponse(user, clinic, ipAddress, userAgent);

    // Link the new token as replacement
    const newToken = await this.refreshTokenModel
      .findOne({ userId: user._id, revokedAt: null })
      .sort({ createdAt: -1 })
      .exec();

    if (newToken) {
      matched.replacedByTokenId = newToken._id as Types.ObjectId;
      await matched.save();
    }

    return result;
  }

  async logout(rawToken: string): Promise<void> {
    const candidates = await this.refreshTokenModel
      .find({ revokedAt: null })
      .exec();

    for (const candidate of candidates) {
      const ok = await argon2.verify(candidate.tokenHash, rawToken);
      if (ok) {
        candidate.revokedAt = new Date();
        await candidate.save();
        return;
      }
    }
  }

  async acceptInvitation(dto: AcceptInvitationDto, ipAddress?: string, userAgent?: string) {
    const invitation = await this.invitationModel
      .findOne({
        token: dto.token,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .exec();

    if (!invitation) {
      throw new BadRequestException('Invitación inválida o expirada');
    }

    const existing = await this.userModel
      .findOne({ clinicId: invitation.clinicId, email: invitation.email, deletedAt: null })
      .exec();
    if (existing) throw new ConflictException('El email ya tiene una cuenta');

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.userModel.create({
      clinicId: invitation.clinicId,
      email: invitation.email,
      passwordHash,
      name: dto.name,
      role: invitation.role,
      isClinical: invitation.isClinical,
      clinicalProfile: invitation.isClinical
        ? {
            license: dto.license,
            specialty: dto.specialty,
            agendaColor: dto.agendaColor,
          }
        : undefined,
    });

    invitation.acceptedAt = new Date();
    await invitation.save();

    const clinic = await this.clinicModel.findById(invitation.clinicId).exec();
    if (!clinic) throw new NotFoundException('Consultorio no encontrado');

    return this.buildAuthResponse(user, clinic, ipAddress, userAgent);
  }

  private async buildAuthResponse(
    user: UserDocument,
    clinic: ClinicDocument,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const payload = {
      sub: (user._id as Types.ObjectId).toString(),
      email: user.email,
      clinicId: (user.clinicId as Types.ObjectId).toString(),
      role: user.role,
      isClinical: user.isClinical,
    };

    const accessToken = this.jwtService.sign(payload);

    // Generate raw refresh token and store its hash
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = await argon2.hash(rawRefreshToken);

    const expiresInDays =
      parseInt(
        this.config.get('JWT_USER_REFRESH_EXPIRES_IN', '30d').replace('d', ''),
      ) || 30;

    await this.refreshTokenModel.create({
      userId: user._id,
      clinicId: user.clinicId,
      tokenHash,
      expiresAt: addDays(new Date(), expiresInDays),
      userAgent,
      ipAddress,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        id: (user._id as Types.ObjectId).toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        isClinical: user.isClinical,
        clinicalProfile: user.clinicalProfile,
      },
      clinic: {
        id: (clinic._id as Types.ObjectId).toString(),
        name: clinic.name,
        status: clinic.status,
        brandColor: clinic.brandColor,
        subscriptionEndsAt: clinic.subscriptionEndsAt ?? null,
        isReadonly: isReadonly(clinic),
      },
    };
  }
}
