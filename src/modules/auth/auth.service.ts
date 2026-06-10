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
import { LookupDto } from './dto/lookup.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import {
  PasswordResetRequest,
  PasswordResetRequestDocument,
} from '../admin/schemas/password-reset-request.schema';
import { TelegramService } from '../admin/telegram.service';
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

// How many devices can stay logged in at the same time per user. A 3rd login
// evicts the oldest session, so a person's own laptop + phone coexist.
const MAX_ACTIVE_SESSIONS = 2;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Clinic.name) private clinicModel: Model<ClinicDocument>,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(Invitation.name)
    private invitationModel: Model<InvitationDocument>,
    @InjectModel(PasswordResetRequest.name)
    private resetRequestModel: Model<PasswordResetRequestDocument>,
    private jwtService: JwtService,
    private config: ConfigService,
    private telegram: TelegramService,
  ) {}

  // Public lookup used by the two-step login UI. Returns the display name
  // and clinic branding for the welcome screen, plus the mustChangePassword
  // flag so the client knows whether to show "ingresá tu contraseña" or
  // "creá tu contraseña". Does not authenticate — no password is checked
  // here and no token is issued. Rate-limited at the controller layer.
  async lookup(dto: LookupDto) {
    const raw = dto.identifier.trim().toLowerCase();
    if (!raw) {
      return { exists: false };
    }

    const user = await this.userModel
      .findOne({
        deletedAt: null,
        $or: [{ email: raw }, { username: raw }],
      })
      .exec();

    if (!user) {
      return { exists: false };
    }

    const clinic = await this.clinicModel.findById(user.clinicId).exec();

    return {
      exists: true,
      displayName: user.name,
      mustChangePassword: user.mustChangePassword === true,
      clinic: clinic
        ? {
            name: clinic.name,
            brandColor: clinic.brandColor,
            logoStyle: clinic.logoStyle ?? 'tooth',
          }
        : null,
    };
  }

  // First-login: verify the temp password, set the chosen one, clear the
  // flag, and issue tokens just like a normal login. Same response shape
  // as login() so the client can drop the user straight into the app.
  async setupPassword(dto: SetupPasswordDto, ipAddress?: string, userAgent?: string) {
    const raw = dto.identifier.trim().toLowerCase();
    const user = await this.userModel
      .findOne({
        deletedAt: null,
        $or: [{ email: raw }, { username: raw }],
      })
      .exec();

    if (!user) throw new UnauthorizedException('Credenciales inválidas');
    if (!user.mustChangePassword) {
      throw new BadRequestException('Esta cuenta ya tiene contraseña definida');
    }

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const clinic = await this.clinicModel.findById(user.clinicId).exec();
    if (!clinic) throw new UnauthorizedException('Consultorio no encontrado');
    if (isFullyBlocked(clinic)) {
      throw new ForbiddenException('La suscripción venció.');
    }

    user.passwordHash = await argon2.hash(dto.newPassword);
    user.mustChangePassword = false;
    user.lastLoginAt = new Date();
    await user.save();

    return this.buildAuthResponse(user, clinic, ipAddress, userAgent);
  }

  // Public "olvidé mi contraseña". Always returns `{ ok: true }` — even when
  // the identifier doesn't match a user — so an attacker can't enumerate
  // accounts through this endpoint. Real matches create a row in
  // password_reset_requests (deduped: one pending row per user) and fire a
  // Telegram push to the super-admin.
  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const raw = dto.identifier.trim().toLowerCase();
    if (!raw) return { ok: true };

    const user = await this.userModel
      .findOne({
        deletedAt: null,
        $or: [{ email: raw }, { username: raw }],
      })
      .exec();

    if (!user) return { ok: true };

    const existing = await this.resetRequestModel
      .findOne({ userId: user._id, resolvedAt: null })
      .exec();

    if (!existing) {
      await this.resetRequestModel.create({
        clinicId: user.clinicId,
        userId: user._id,
        identifier: raw,
        note: dto.note?.trim() || undefined,
        requestedAt: new Date(),
      });

      const clinic = await this.clinicModel.findById(user.clinicId).select('name').exec();
      const lines = [
        '🔑 <b>Pedido de reset de contraseña</b>',
        `Usuario: <code>${raw}</code> (${user.name})`,
        clinic ? `Consultorio: ${clinic.name}` : null,
        dto.note ? `Motivo: ${dto.note.trim()}` : null,
        '',
        'Resolvelo desde la consola.',
      ].filter(Boolean);
      // Fire-and-forget so a Telegram outage doesn't block the response.
      this.telegram.notify(lines.join('\n')).catch(() => {});
    }

    return { ok: true };
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    // Accept either `identifier` (preferred — could be username or email) or
    // legacy `email`. The actual lookup tries both fields so the dentist can
    // sign in with whatever the backoffice gave them.
    const raw = (dto.identifier ?? dto.email ?? '').trim().toLowerCase();
    if (!raw) throw new UnauthorizedException('Credenciales inválidas');

    const user = await this.userModel
      .findOne({
        deletedAt: null,
        $or: [{ email: raw }, { username: raw }],
      })
      .exec();

    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    // First-login user: refuse the regular login flow and tell the client
    // to send the password to /auth/setup-password instead.
    if (user.mustChangePassword) {
      throw new ForbiddenException({
        code: 'MUST_CHANGE_PASSWORD',
        message: 'Tenés que crear una nueva contraseña para continuar.',
      });
    }

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

  // Device cap. Instead of a hard single-session, we allow up to
  // MAX_ACTIVE_SESSIONS live refresh tokens per user so one person can use
  // their own laptop + phone without being bounced. When a new login pushes
  // past the cap, the OLDEST sessions are evicted (SESSION_REPLACED) — the
  // device you're actively using (newest token) is always kept. Called from
  // buildAuthResponse after the new token exists. Cheap: one query per login,
  // nothing per request.
  private async enforceDeviceLimit(userId: Types.ObjectId): Promise<void> {
    const live = await this.refreshTokenModel
      .find({ userId, revokedAt: null })
      .sort({ createdAt: -1 })
      .select('_id')
      .exec();

    if (live.length <= MAX_ACTIVE_SESSIONS) return;

    const excessIds = live.slice(MAX_ACTIVE_SESSIONS).map(t => t._id);
    await this.refreshTokenModel
      .updateMany(
        { _id: { $in: excessIds } },
        { revokedAt: new Date(), revokeReason: 'SESSION_REPLACED' },
      )
      .exec();
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
      // No live match — check the revoked table to differentiate "the user
      // just logged in elsewhere" from "someone is replaying a stolen
      // token". Only the second one nukes every active session.
      const revokedCandidates = await this.refreshTokenModel
        .find({ revokedAt: { $ne: null } })
        .exec();

      for (const candidate of revokedCandidates) {
        const ok = await argon2.verify(candidate.tokenHash, rawToken);
        if (ok) {
          if (candidate.revokeReason === 'SESSION_REPLACED') {
            // Silent eviction — the user opened a new session somewhere
            // else. Do NOT touch other tokens (the new device's token is
            // still valid) and surface a specific code so the client can
            // explain it.
            throw new UnauthorizedException({
              code: 'SESSION_REPLACED',
              message: 'Tu sesión se cerró porque entraste desde otro dispositivo.',
            });
          }
          // Genuine reuse of an already-rotated token — assume the token
          // was stolen and burn every session for the user.
          await this.refreshTokenModel.updateMany(
            { userId: candidate.userId, revokedAt: null },
            { revokedAt: new Date(), revokeReason: 'LOGOUT' },
          );
          throw new UnauthorizedException('Token reutilizado. Sesión revocada.');
        }
      }

      throw new UnauthorizedException('Refresh token inválido');
    }

    // Revoke the used token as a rotation — explicitly NOT a session swap,
    // so the existing-token replay detection above keeps working.
    matched.revokedAt = new Date();
    matched.revokeReason = 'ROTATED';
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
        candidate.revokeReason = 'LOGOUT';
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

    // Refresh tokens are 24h on a sliding window: every refresh revokes the
    // old token and mints a new one with a fresh 24h expiry. Configurable
    // via JWT_USER_REFRESH_EXPIRES_IN (e.g. "7d" for a longer fallback).
    const expiresInDays =
      parseInt(
        this.config.get('JWT_USER_REFRESH_EXPIRES_IN', '1d').replace('d', ''),
      ) || 1;

    await this.refreshTokenModel.create({
      userId: user._id,
      clinicId: user.clinicId,
      tokenHash,
      expiresAt: addDays(new Date(), expiresInDays),
      userAgent,
      ipAddress,
    });

    // Keep at most MAX_ACTIVE_SESSIONS devices logged in — evict the oldest.
    await this.enforceDeviceLimit(user._id as Types.ObjectId);

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
        trialEndsAt: clinic.trialEndsAt ?? null,
        isReadonly: isReadonly(clinic),
      },
    };
  }
}
