import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import {
  Clinic,
  ClinicDocument,
  SubscriptionStatus,
} from '../clinics/schemas/clinic.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { Banner, BannerDocument } from '../banners/schemas/banner.schema';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import {
  AdminSettings,
  AdminSettingsDocument,
} from './schemas/admin-settings.schema';
import {
  PasswordResetRequest,
  PasswordResetRequestDocument,
} from './schemas/password-reset-request.schema';
import {
  CreateBannerDto,
  CreateClinicAccountDto,
  ExtendSubscriptionDto,
  RecordPaymentDto,
  UpdateAdminSettingsDto,
  UpdateClinicSubscriptionDto,
} from './dto/admin.dto';

const MS_PER_DAY = 86_400_000;
const DEFAULT_PAYMENT_DAYS = 30;

export type PaymentStatusKey =
  | 'ok'
  | 'due-soon'
  | 'overdue'
  | 'grace-end'
  | 'pending';

// Normalize an operator-supplied username/slug. Trust whatever the backoffice
// sent — only lowercase, drop whitespace, and strip diacritics. No replacing
// dots/dashes/underscores: if the operator wanted `matias.duarte`, that's what
// gets stored and what the dentist logs in with.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 64);
}

// Friendly temp password — pairs an adjective with a 4-digit number. Easy to
// type from a WhatsApp message. The dentist changes it on first login.
function generateTempPassword(): string {
  const adj = ['sol', 'rio', 'mar', 'luz', 'pan', 'ave', 'tren', 'faro'];
  const word = adj[Math.floor(Math.random() * adj.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${n}`;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(Clinic.name) private clinicModel: Model<ClinicDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Banner.name) private bannerModel: Model<BannerDocument>,
    @InjectModel(Patient.name) private patientModel: Model<PatientDocument>,
    @InjectModel(AdminSettings.name)
    private adminSettingsModel: Model<AdminSettingsDocument>,
    @InjectModel(PasswordResetRequest.name)
    private resetRequestModel: Model<PasswordResetRequestDocument>,
    private jwtService: JwtService,
  ) {}

  // ---------------------------------------------------------------------------
  // Settings (singleton document)
  // ---------------------------------------------------------------------------

  async getSettings(): Promise<AdminSettings> {
    const existing = await this.adminSettingsModel.findOne().exec();
    if (existing) return existing;
    return this.adminSettingsModel.create({});
  }

  async updateSettings(dto: UpdateAdminSettingsDto) {
    const settings = await this.getSettings();
    if (dto.gracePeriodDays != null) settings.gracePeriodDays = dto.gracePeriodDays;
    if (dto.planPriceMonthly != null) settings.planPriceMonthly = dto.planPriceMonthly;
    return (settings as AdminSettingsDocument).save();
  }

  // ---------------------------------------------------------------------------
  // Derived payment helpers
  // ---------------------------------------------------------------------------

  /**
   * Computes the rough "days until the clinic's countdown ends".
   * - TRIAL → counts against `trialEndsAt`
   * - everything else → counts against `subscriptionEndsAt`
   * Positive = days left; negative = days overdue; `null` if the relevant
   * date isn't set yet.
   */
  private computeDaysToDue(clinic: Clinic): number | null {
    const target =
      clinic.status === SubscriptionStatus.TRIAL
        ? clinic.trialEndsAt
        : clinic.subscriptionEndsAt;
    if (!target) return null;
    const diff = target.getTime() - Date.now();
    return Math.ceil(diff / MS_PER_DAY);
  }

  private derivePaymentStatus(
    _clinic: Clinic,
    daysToDue: number | null,
    gracePeriodDays: number,
  ): PaymentStatusKey {
    // No date set at all (e.g. a legacy TRIAL row with no trialEndsAt) →
    // we don't know when to chase, so leave it as pending.
    if (daysToDue == null) return 'pending';
    if (daysToDue > 7) return 'ok';
    if (daysToDue >= 0) return 'due-soon';
    const over = -daysToDue;
    if (over <= gracePeriodDays) return 'overdue';
    return 'grace-end';
  }

  // ---------------------------------------------------------------------------
  // Clinic list / detail — enriched with patientsCount, lastLoginAt, payment
  // ---------------------------------------------------------------------------

  private async enrichClinic(clinic: ClinicDocument, gracePeriodDays: number) {
    const clinicId = clinic._id as Types.ObjectId;
    const [patientsCount, lastUser, owner] = await Promise.all([
      this.patientModel.countDocuments({ clinicId, deletedAt: null }),
      this.userModel
        .findOne({ clinicId, deletedAt: null })
        .sort({ lastLoginAt: -1 })
        .select('lastLoginAt')
        .exec(),
      this.userModel
        .findOne({ clinicId, role: UserRole.OWNER, deletedAt: null })
        .select('mustChangePassword')
        .exec(),
    ]);
    const daysToDue = this.computeDaysToDue(clinic);
    const paymentStatus = this.derivePaymentStatus(clinic, daysToDue, gracePeriodDays);
    // The OWNER has activated the account if they've taken setupPassword off
    // the pending list. New seeded accounts (no flag) are treated as activated
    // so the badge doesn't regress on existing data.
    const activated = owner ? owner.mustChangePassword !== true : true;

    return {
      _id: clinicId.toString(),
      name: clinic.name,
      slug: clinic.slug,
      doctorName: clinic.doctorName,
      city: clinic.city,
      phone: clinic.phone,
      contactEmail: clinic.contactEmail,
      status: clinic.status,
      brandColor: clinic.brandColor,
      logoStyle: clinic.logoStyle,
      subscriptionEndsAt: clinic.subscriptionEndsAt ?? null,
      trialEndsAt: clinic.trialEndsAt ?? null,
      createdAt: clinic.createdAt,
      updatedAt: clinic.updatedAt,
      patientsCount,
      lastLoginAt: lastUser?.lastLoginAt ?? null,
      daysToDue,
      paymentStatus,
      activated,
    };
  }

  async findAllClinics(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const settings = await this.getSettings();
    const [clinics, total] = await Promise.all([
      this.clinicModel
        .find({ deletedAt: null })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.clinicModel.countDocuments({ deletedAt: null }),
    ]);
    const enriched = await Promise.all(
      clinics.map(c => this.enrichClinic(c, settings.gracePeriodDays)),
    );
    return { clinics: enriched, total, page, limit };
  }

  async findClinicById(clinicId: string) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    const settings = await this.getSettings();
    return this.enrichClinic(clinic, settings.gracePeriodDays);
  }

  // ---------------------------------------------------------------------------
  // Username/slug availability (used by the backoffice form in live validation)
  // ---------------------------------------------------------------------------

  async checkSlugAvailability(slug: string): Promise<{ available: boolean; slug: string }> {
    const normalized = slugify(slug);
    if (!normalized) return { available: false, slug: normalized };
    const taken = await this.clinicModel
      .exists({ slug: normalized, deletedAt: null });
    return { available: !taken, slug: normalized };
  }

  // ---------------------------------------------------------------------------
  // Account creation (clinic + OWNER user + return temp credentials once)
  // ---------------------------------------------------------------------------

  async createClinicAccount(dto: CreateClinicAccountDto) {
    const slug = slugify(dto.slug || dto.name);
    if (!slug) throw new BadRequestException('Slug inválido');

    const slugTaken = await this.clinicModel
      .exists({ slug, deletedAt: null });
    if (slugTaken) throw new BadRequestException('Ese usuario / slug ya existe');

    const tempPassword = dto.password ?? generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword);
    const settings = await this.getSettings();

    const clinic = await this.clinicModel.create({
      name: dto.name,
      slug,
      doctorName: dto.doctorName,
      city: dto.city,
      phone: dto.phone,
      contactEmail: dto.contactEmail,
      brandColor: dto.brandColor ?? '#2F54EB',
      logoStyle: dto.logoStyle ?? 'tooth',
      status: SubscriptionStatus.TRIAL,
      // Configurable trial — moved to ACTIVE on first payment. After it
      // expires the clinic flows through the same due-soon → overdue
      // → grace-end states a paid subscription does.
      trialEndsAt: new Date(Date.now() + settings.trialDays * MS_PER_DAY),
    });

    // Synthetic email so the existing unique index `(clinicId, email)` keeps
    // working even when the dentist signs up via username. Format:
    // <slug>@molar.local — never sent to a real inbox.
    const syntheticEmail = `${slug}@molar.local`;

    await this.userModel.create({
      clinicId: clinic._id,
      email: syntheticEmail,
      username: slug,
      passwordHash,
      name: dto.doctorName,
      role: UserRole.OWNER,
      isClinical: true,
      mustChangePassword: true,
    });

    const enriched = await this.enrichClinic(clinic, settings.gracePeriodDays);

    return {
      clinic: enriched,
      ownerCredentials: {
        username: slug,
        tempPassword,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Subscription actions (extend, payment, suspend, reactivate)
  // ---------------------------------------------------------------------------

  async updateClinicSubscription(clinicId: string, dto: UpdateClinicSubscriptionDto) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    if (dto.status) clinic.status = dto.status as unknown as SubscriptionStatus;
    if (dto.subscriptionEndsAt) clinic.subscriptionEndsAt = new Date(dto.subscriptionEndsAt);
    await clinic.save();
    const settings = await this.getSettings();
    return this.enrichClinic(clinic, settings.gracePeriodDays);
  }

  async extendSubscription(clinicId: string, dto: ExtendSubscriptionDto) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    const base = clinic.subscriptionEndsAt ?? new Date();
    clinic.subscriptionEndsAt = new Date(base.getTime() + dto.days * MS_PER_DAY);
    if (clinic.status === SubscriptionStatus.SUSPENDED) {
      clinic.status = SubscriptionStatus.ACTIVE;
    }
    await clinic.save();
    const settings = await this.getSettings();
    return this.enrichClinic(clinic, settings.gracePeriodDays);
  }

  async recordPayment(clinicId: string, dto: RecordPaymentDto) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    const days = dto.days ?? DEFAULT_PAYMENT_DAYS;
    // Pago renueva la suscripción desde hoy (no se acumula desde una fecha
    // vencida — el dentista paga "el próximo mes" desde el momento del pago).
    clinic.subscriptionEndsAt = new Date(Date.now() + days * MS_PER_DAY);
    clinic.status = SubscriptionStatus.ACTIVE;
    await clinic.save();
    const settings = await this.getSettings();
    return this.enrichClinic(clinic, settings.gracePeriodDays);
  }

  async suspendClinic(clinicId: string) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    clinic.status = SubscriptionStatus.SUSPENDED;
    await clinic.save();
    const settings = await this.getSettings();
    return this.enrichClinic(clinic, settings.gracePeriodDays);
  }

  async reactivateClinic(clinicId: string) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    clinic.status = SubscriptionStatus.ACTIVE;
    // If subscription is already in the past, push it by 7 days as a grace
    // gesture so the clinic isn't immediately blocked again.
    if (!clinic.subscriptionEndsAt || clinic.subscriptionEndsAt < new Date()) {
      clinic.subscriptionEndsAt = new Date(Date.now() + 7 * MS_PER_DAY);
    }
    await clinic.save();
    const settings = await this.getSettings();
    return this.enrichClinic(clinic, settings.gracePeriodDays);
  }

  // ---------------------------------------------------------------------------
  // Credential reset (one-time plain text response)
  // ---------------------------------------------------------------------------

  async resetCredentials(clinicId: string) {
    const owner = await this.userModel
      .findOne({
        clinicId: new Types.ObjectId(clinicId),
        role: UserRole.OWNER,
        deletedAt: null,
      })
      .exec();
    if (!owner) throw new NotFoundException('OWNER user no encontrado');
    const tempPassword = generateTempPassword();
    owner.passwordHash = await argon2.hash(tempPassword);
    owner.mustChangePassword = true;
    await owner.save();

    // Auto-close any pending reset requests for this clinic — the BO inbox
    // shouldn't keep nagging once the admin has actually reset the password.
    await this.resetRequestModel
      .updateMany(
        { clinicId: new Types.ObjectId(clinicId), resolvedAt: null },
        { resolvedAt: new Date() },
      )
      .exec();

    return { tempPassword };
  }

  // ---------------------------------------------------------------------------
  // Impersonation — issue a clinic JWT signed as the OWNER, with `imp: true`
  // ---------------------------------------------------------------------------

  async impersonateClinic(clinicId: string, adminId: string) {
    const owner = await this.userModel
      .findOne({
        clinicId: new Types.ObjectId(clinicId),
        role: UserRole.OWNER,
        deletedAt: null,
      })
      .exec();
    if (!owner) throw new NotFoundException('OWNER user no encontrado');

    const payload = {
      sub: (owner._id as Types.ObjectId).toString(),
      email: owner.email,
      clinicId: (owner.clinicId as Types.ObjectId).toString(),
      role: owner.role,
      isClinical: owner.isClinical,
      imp: true,
      impBy: adminId,
    };

    const accessToken = this.jwtService.sign(payload);
    this.logger.warn(
      `[IMPERSONATE] admin=${adminId} clinic=${clinicId} owner=${owner._id}`,
    );
    return { accessToken };
  }

  // ---------------------------------------------------------------------------
  // Password reset inbox
  // ---------------------------------------------------------------------------

  async listPasswordResetRequests() {
    const requests = await this.resetRequestModel
      .find({ resolvedAt: null })
      .sort({ requestedAt: -1 })
      .lean()
      .exec();

    if (requests.length === 0) return [];

    const clinicIds = [...new Set(requests.map(r => r.clinicId.toString()))];
    const userIds = [...new Set(requests.map(r => r.userId.toString()))];
    const [clinics, users] = await Promise.all([
      this.clinicModel.find({ _id: { $in: clinicIds } }).lean().exec(),
      this.userModel.find({ _id: { $in: userIds } }).lean().exec(),
    ]);
    const clinicMap = new Map(clinics.map(c => [c._id.toString(), c]));
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    return requests.map(r => {
      const clinic = clinicMap.get(r.clinicId.toString());
      const user = userMap.get(r.userId.toString());
      return {
        _id: r._id.toString(),
        identifier: r.identifier,
        note: r.note ?? null,
        requestedAt: r.requestedAt,
        clinic: clinic
          ? {
              _id: clinic._id.toString(),
              name: clinic.name,
              slug: clinic.slug,
              phone: clinic.phone ?? null,
              doctorName: clinic.doctorName ?? null,
            }
          : null,
        user: user ? { name: user.name, username: user.username ?? null } : null,
      };
    });
  }

  async resolvePasswordResetRequest(id: string) {
    const req = await this.resetRequestModel.findById(id).exec();
    if (!req) throw new NotFoundException('Pedido no encontrado');
    if (req.resolvedAt) return { _id: req._id.toString(), resolvedAt: req.resolvedAt };
    req.resolvedAt = new Date();
    await req.save();
    return { _id: req._id.toString(), resolvedAt: req.resolvedAt };
  }

  async countPendingPasswordResetRequests() {
    const count = await this.resetRequestModel.countDocuments({ resolvedAt: null }).exec();
    return { count };
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  async getMetrics() {
    const settings = await this.getSettings();
    const [
      totalClinics,
      activeClinics,
      trialClinics,
      suspendedClinics,
      totalUsers,
      clinics,
      pendingOwners,
    ] = await Promise.all([
      this.clinicModel.countDocuments({ deletedAt: null }),
      this.clinicModel.countDocuments({ deletedAt: null, status: SubscriptionStatus.ACTIVE }),
      this.clinicModel.countDocuments({ deletedAt: null, status: SubscriptionStatus.TRIAL }),
      this.clinicModel.countDocuments({ deletedAt: null, status: SubscriptionStatus.SUSPENDED }),
      this.userModel.countDocuments({ deletedAt: null }),
      this.clinicModel.find({ deletedAt: null }).select('subscriptionEndsAt status createdAt').exec(),
      this.userModel.countDocuments({
        deletedAt: null,
        role: UserRole.OWNER,
        mustChangePassword: true,
      }),
    ]);

    let overdueCount = 0;
    let dueSoonCount = 0;
    let graceEndCount = 0;
    const monthAgo = new Date(Date.now() - 30 * MS_PER_DAY);
    let newThisMonth = 0;

    for (const c of clinics) {
      const days = this.computeDaysToDue(c);
      const key = this.derivePaymentStatus(c, days, settings.gracePeriodDays);
      if (key === 'overdue') overdueCount++;
      else if (key === 'grace-end') graceEndCount++;
      else if (key === 'due-soon') dueSoonCount++;
      if (c.createdAt && c.createdAt > monthAgo) newThisMonth++;
    }

    return {
      totalClinics,
      activeClinics,
      trialClinics,
      suspendedClinics,
      pendingActivationCount: pendingOwners,
      totalUsers,
      mrr: activeClinics * settings.planPriceMonthly,
      planPriceMonthly: settings.planPriceMonthly,
      gracePeriodDays: settings.gracePeriodDays,
      overdueCount,
      graceEndCount,
      dueSoonCount,
      newThisMonth,
    };
  }

  // ---------------------------------------------------------------------------
  // Banners (kept as-is from existing implementation)
  // ---------------------------------------------------------------------------

  async createBanner(dto: CreateBannerDto) {
    return this.bannerModel.create({
      ...dto,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      isActive: dto.isActive ?? true,
    });
  }

  async deleteBanner(bannerId: string) {
    const banner = await this.bannerModel.findById(bannerId).exec();
    if (!banner) throw new NotFoundException('Banner no encontrado');
    await banner.deleteOne();
    return { deleted: true };
  }

  async findAllBanners() {
    return this.bannerModel.find().sort({ createdAt: -1 }).exec();
  }
}
