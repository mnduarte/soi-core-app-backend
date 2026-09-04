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
import {
  User,
  UserDocument,
  UserRole,
  UserTitle,
} from '../users/schemas/user.schema';
import { Banner, BannerDocument } from '../banners/schemas/banner.schema';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../appointments/schemas/appointment.schema';
import {
  AdminSettings,
  AdminSettingsDocument,
} from './schemas/admin-settings.schema';
import {
  ClinicPayment,
  ClinicPaymentDocument,
  PaymentMethod,
} from './schemas/clinic-payment.schema';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';
import {
  subscriptionState,
  trialEndFor,
  trialMonthNumber,
  TRIAL_MONTHS,
} from '../../common/subscription.policy';
import {
  PasswordResetRequest,
  PasswordResetRequestDocument,
} from './schemas/password-reset-request.schema';
import {
  CreateBannerDto,
  CreateClinicAccountDto,
  CreateClinicUserDto,
  ExtendSubscriptionDto,
  RecordPaymentDto,
  UpdateAdminSettingsDto,
  UpdateClinicDto,
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
    @InjectModel(Appointment.name)
    private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AdminSettings.name)
    private adminSettingsModel: Model<AdminSettingsDocument>,
    @InjectModel(ClinicPayment.name)
    private clinicPaymentModel: Model<ClinicPaymentDocument>,
    private mercadoPago: MercadoPagoService,
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
    if (dto.gracePeriodDays != null)
      settings.gracePeriodDays = dto.gracePeriodDays;
    if (dto.planPriceMonthly != null)
      settings.planPriceMonthly = dto.planPriceMonthly;
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
  // Precio que paga ESTE consultorio: el suyo si tiene uno negociado, si no el
  // de lista. Un solo lugar donde se resuelve, para que el backoffice, el pago
  // y (mañana) la suscripción de Mercado Pago no puedan discrepar.
  private effectivePrice(clinic: Clinic, globalPrice: number): number {
    return clinic.planPriceMonthly ?? globalPrice;
  }

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

  /**
   * Turnos cargados por cada clínica en los últimos 7 días.
   *
   * UN aggregate para toda la página, no una query por clínica: `enrichClinic`
   * ya hace 3 por clínica y la lista las multiplica por N. Contesta la otra
   * mitad de la pregunta: la presencia dice si están adentro, esto dice si
   * están trabajando. Se puede tener la pestaña abierta todo el día y no haber
   * cargado un turno en tres semanas — eso es un cliente que se está yendo, y
   * una luz verde de "en línea" lo esconde.
   */
  private async usoReciente(
    clinicIds: Types.ObjectId[],
  ): Promise<Map<string, number>> {
    const desde = new Date(Date.now() - 7 * MS_PER_DAY);
    const rows = await this.appointmentModel.aggregate<{
      _id: Types.ObjectId;
      n: number;
    }>([
      {
        $match: {
          clinicId: { $in: clinicIds },
          deletedAt: null,
          createdAt: { $gte: desde },
        },
      },
      { $group: { _id: '$clinicId', n: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [r._id.toString(), r.n]));
  }

  private async enrichClinic(
    clinic: ClinicDocument,
    gracePeriodDays: number,
    planPriceMonthly: number,
    uso?: Map<string, number>,
  ) {
    const clinicId = clinic._id;
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
    const paymentStatus = this.derivePaymentStatus(
      clinic,
      daysToDue,
      gracePeriodDays,
    );
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
      // Presencia real (app abierta y a la vista), distinta del login. Ver
      // `Clinic.lastSeenAt` y ChangesService.
      lastSeenAt: clinic.lastSeenAt ?? null,
      // Turnos cargados en los últimos 7 días. `undefined` cuando el llamador
      // no pidió el uso; el front distingue "sin datos" de "cero actividad",
      // que significan cosas muy distintas.
      turnos7d: uso ? (uso.get(clinicId.toString()) ?? 0) : undefined,
      daysToDue,
      paymentStatus,
      activated,
      // `planPriceMonthly` es lo negociado con este consultorio (null = usa el
      // de lista) y `effectivePrice` es lo que realmente paga. Van los dos: el
      // backoffice necesita distinguir "no tiene precio propio" de "tiene uno
      // que coincide con el global".
      planPriceMonthly: clinic.planPriceMonthly ?? null,
      effectivePrice: this.effectivePrice(clinic, planPriceMonthly),
      // Qué está viviendo el consultorio AHORA: sale de la misma función que
      // corta el acceso, no de un cálculo paralelo. Antes el backoffice decía
      // "Vencido 33d" para cuentas que tenían acceso completo, porque contaba
      // desde otra fecha que la que el sistema mira para restringir.
      access: subscriptionState(clinic),
      // Cómo viene la prueba: desde cuándo, por qué mes va y cuándo termina.
      // Se calcula acá para que el backoffice no tenga que replicar la regla
      // de "el mes del alta cuenta entero".
      trial:
        clinic.status === SubscriptionStatus.TRIAL
          ? {
              startedAt: clinic.createdAt,
              month: trialMonthNumber(clinic.createdAt),
              months: TRIAL_MONTHS,
              endsAt: clinic.trialEndsAt ?? null,
            }
          : null,
      mpPreapprovalStatus: clinic.mpPreapprovalStatus ?? null,
      mpInitPoint: clinic.mpInitPoint ?? null,
      mpFirstChargeAt: clinic.mpFirstChargeAt ?? null,
      mpLastFailureAt: clinic.mpLastFailureAt ?? null,
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
    const uso = await this.usoReciente(clinics.map((c) => c._id));
    const enriched = await Promise.all(
      clinics.map((c) =>
        this.enrichClinic(
          c,
          settings.gracePeriodDays,
          settings.planPriceMonthly,
          uso,
        ),
      ),
    );
    return { clinics: enriched, total, page, limit };
  }

  async findClinicById(clinicId: string) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    const settings = await this.getSettings();
    const uso = await this.usoReciente([clinic._id]);
    return this.enrichClinic(
      clinic,
      settings.gracePeriodDays,
      settings.planPriceMonthly,
      uso,
    );
  }

  // ---------------------------------------------------------------------------
  // Username/slug availability (used by the backoffice form in live validation)
  // ---------------------------------------------------------------------------

  async checkSlugAvailability(
    slug: string,
  ): Promise<{ available: boolean; slug: string }> {
    const normalized = slugify(slug);
    if (!normalized) return { available: false, slug: normalized };
    const taken = await this.clinicModel.exists({
      slug: normalized,
      deletedAt: null,
    });
    return { available: !taken, slug: normalized };
  }

  // ---------------------------------------------------------------------------
  // Account creation (clinic + OWNER user + return temp credentials once)
  // ---------------------------------------------------------------------------

  async createClinicAccount(dto: CreateClinicAccountDto) {
    const slug = slugify(dto.slug || dto.name);
    if (!slug) throw new BadRequestException('Slug inválido');

    const slugTaken = await this.clinicModel.exists({ slug, deletedAt: null });
    if (slugTaken)
      throw new BadRequestException('Ese usuario / slug ya existe');

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
      // Dos meses de prueba, contados por mes calendario y con el mes del alta
      // entero: un alta del 15 de junio tiene junio y julio, y el primer cobro
      // cae el 1 de agosto. Antes eran N dias corridos desde el alta, asi que
      // cada consultorio vencia un dia distinto.
      trialEndsAt: trialEndFor(new Date()),
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
      title: (dto.doctorTitle as UserTitle) ?? UserTitle.NONE,
      role: UserRole.OWNER,
      isClinical: true,
      mustChangePassword: true,
    });

    const enriched = await this.enrichClinic(
      clinic,
      settings.gracePeriodDays,
      settings.planPriceMonthly,
    );

    return {
      clinic: enriched,
      ownerCredentials: {
        username: slug,
        tempPassword,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Edit clinic profile (name, doctor, branding) from the backoffice
  // ---------------------------------------------------------------------------

  async updateClinic(clinicId: string, dto: UpdateClinicDto) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');

    const fields = [
      'name',
      'doctorName',
      'city',
      'phone',
      'contactEmail',
      'brandColor',
      'logoStyle',
    ] as const;
    for (const f of fields) {
      if (dto[f] !== undefined)
        (clinic as unknown as Record<string, unknown>)[f] = dto[f];
    }
    clinic.updatedAt = new Date();
    await clinic.save();

    // Keep the OWNER's display name in sync with the doctor name so the
    // dentist app greeting ("Buen día, Dr. X") matches what the admin sees.
    if (dto.doctorName !== undefined) {
      await this.userModel
        .updateOne(
          { clinicId: clinic._id, role: UserRole.OWNER, deletedAt: null },
          { name: dto.doctorName },
        )
        .exec();
    }

    const settings = await this.getSettings();
    return this.enrichClinic(
      clinic,
      settings.gracePeriodDays,
      settings.planPriceMonthly,
    );
  }

  // ---------------------------------------------------------------------------
  // Subscription actions (extend, payment, suspend, reactivate)
  // ---------------------------------------------------------------------------

  async updateClinicSubscription(
    clinicId: string,
    dto: UpdateClinicSubscriptionDto,
  ) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    if (dto.status) clinic.status = dto.status as unknown as SubscriptionStatus;
    if (dto.subscriptionEndsAt)
      clinic.subscriptionEndsAt = new Date(dto.subscriptionEndsAt);
    await clinic.save();
    const settings = await this.getSettings();
    return this.enrichClinic(
      clinic,
      settings.gracePeriodDays,
      settings.planPriceMonthly,
    );
  }

  async extendSubscription(clinicId: string, dto: ExtendSubscriptionDto) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    const base = clinic.subscriptionEndsAt ?? new Date();
    clinic.subscriptionEndsAt = new Date(
      base.getTime() + dto.days * MS_PER_DAY,
    );
    if (clinic.status === SubscriptionStatus.SUSPENDED) {
      clinic.status = SubscriptionStatus.ACTIVE;
    }
    await clinic.save();
    const settings = await this.getSettings();
    return this.enrichClinic(
      clinic,
      settings.gracePeriodDays,
      settings.planPriceMonthly,
    );
  }

  async recordPayment(
    clinicId: string,
    dto: RecordPaymentDto,
    adminId?: string,
  ) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    const settings = await this.getSettings();

    // El período arranca donde termina lo que YA tiene pago, no en el día de
    // hoy. Si paga adelantado (o si se registra el pago dos veces por error),
    // los meses se SUMAN en vez de pisarse: antes, registrar un pago un 2 de
    // septiembre a alguien cubierto hasta el 21 lo dejaba hasta el 2 de
    // octubre — le comía 19 días ya pagos.
    const cubierto = clinic.subscriptionEndsAt;
    const periodFrom =
      cubierto && cubierto.getTime() > Date.now()
        ? new Date(cubierto)
        : new Date();

    // En meses de calendario, no en bloques de 30 días: "pago hasta el 21 de
    // octubre" es lo que el dentista entiende, y no se corre unos días por mes.
    const meses = dto.months ?? 1;
    const periodTo = new Date(periodFrom);
    if (dto.days) periodTo.setTime(periodTo.getTime() + dto.days * MS_PER_DAY);
    else periodTo.setMonth(periodTo.getMonth() + meses);

    // El pago queda ASENTADO, no solo corrida la fecha de vencimiento. Es lo
    // que después permite conciliar contra Mercado Pago y contestar "¿desde
    // cuándo paga?" sin adivinar.
    await this.clinicPaymentModel.create({
      clinicId: clinic._id,
      amount:
        dto.amount ??
        this.effectivePrice(clinic, settings.planPriceMonthly) *
          (dto.months ?? 1),
      paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      method: dto.method ?? PaymentMethod.TRANSFER,
      periodFrom,
      periodTo,
      notes: dto.notes,
      recordedBy: adminId ? new Types.ObjectId(adminId) : undefined,
    });

    clinic.subscriptionEndsAt = periodTo;
    clinic.status = SubscriptionStatus.ACTIVE;
    await clinic.save();
    return this.enrichClinic(
      clinic,
      settings.gracePeriodDays,
      settings.planPriceMonthly,
    );
  }

  // Historial de pagos del consultorio, del más reciente al más viejo.
  async listPayments(clinicId: string, limit = 60) {
    return this.clinicPaymentModel
      .find({ clinicId: new Types.ObjectId(clinicId), deletedAt: null })
      .sort({ paidAt: -1, _id: -1 })
      .limit(limit)
      .exec();
  }

  // Borrado real: un pago mal cargado no debe seguir sumando en los totales.
  // No revierte `subscriptionEndsAt` a propósito — la vigencia se corrige a
  // mano, que es una decisión aparte de "este pago no existió".
  async deletePayment(clinicId: string, paymentId: string) {
    const res = await this.clinicPaymentModel
      .deleteOne({
        _id: new Types.ObjectId(paymentId),
        clinicId: new Types.ObjectId(clinicId),
      })
      .exec();
    if (res.deletedCount === 0)
      throw new NotFoundException('Pago no encontrado');
    return { ok: true };
  }

  // ---- Débito automático ----
  // El monto sale del precio efectivo del consultorio y no del body: que el
  // backoffice pueda mandar cualquier número sería un agujero — quien tenga el
  // token de admin podría crear una suscripción de $1.
  async createMpSubscription(clinicId: string) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    const settings = await this.getSettings();
    const amount = this.effectivePrice(clinic, settings.planPriceMonthly);
    return this.mercadoPago.createSubscription(clinicId, amount);
  }

  cancelMpSubscription(clinicId: string) {
    return this.mercadoPago.cancelSubscription(clinicId);
  }

  syncMpSubscription(clinicId: string) {
    return this.mercadoPago.syncSubscription(clinicId);
  }

  // Precio propio del consultorio. `null` lo devuelve al precio de lista.
  async updateClinicPrice(clinicId: string, planPriceMonthly?: number | null) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    clinic.planPriceMonthly =
      planPriceMonthly == null ? undefined : planPriceMonthly;
    await clinic.save();
    const settings = await this.getSettings();
    return this.enrichClinic(
      clinic,
      settings.gracePeriodDays,
      settings.planPriceMonthly,
    );
  }

  async suspendClinic(clinicId: string) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    clinic.status = SubscriptionStatus.SUSPENDED;
    await clinic.save();
    const settings = await this.getSettings();
    return this.enrichClinic(
      clinic,
      settings.gracePeriodDays,
      settings.planPriceMonthly,
    );
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
    return this.enrichClinic(
      clinic,
      settings.gracePeriodDays,
      settings.planPriceMonthly,
    );
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
  // Clinic users — list / create / reset / deactivate (backoffice managed).
  // A clinic can have N users (1 OWNER + N MEMBER). Usernames are unique
  // GLOBALLY because login resolves the clinic from the username.
  // ---------------------------------------------------------------------------

  async listClinicUsers(clinicId: string) {
    const users = await this.userModel
      .find({ clinicId: new Types.ObjectId(clinicId), deletedAt: null })
      .sort({ role: 1, createdAt: 1 })
      .exec();
    return users.map((u) => ({
      _id: u._id.toString(),
      name: u.name,
      username: u.username ?? null,
      title: u.title ?? UserTitle.NONE,
      role: u.role,
      isClinical: u.isClinical,
      lastLoginAt: u.lastLoginAt ?? null,
      mustChangePassword: u.mustChangePassword,
    }));
  }

  async createClinicUser(clinicId: string, dto: CreateClinicUserDto) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');

    const username = slugify(dto.username);
    if (!username) throw new BadRequestException('Usuario inválido');

    // Global uniqueness — the login looks users up by username across clinics.
    const taken = await this.userModel.exists({ username, deletedAt: null });
    if (taken) throw new BadRequestException('Ese usuario ya está en uso');

    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword);

    const user = await this.userModel.create({
      clinicId: clinic._id,
      // Synthetic email keeps the (clinicId, email) unique index satisfied.
      email: `${username}@molar.local`,
      username,
      passwordHash,
      name: dto.name,
      title: (dto.title as UserTitle) ?? UserTitle.NONE,
      role: dto.role === 'OWNER' ? UserRole.OWNER : UserRole.MEMBER,
      isClinical: dto.isClinical ?? true,
      mustChangePassword: true,
    });

    return {
      user: {
        _id: user._id.toString(),
        name: user.name,
        username,
        role: user.role,
        isClinical: user.isClinical,
      },
      tempPassword,
    };
  }

  async resetUserPassword(clinicId: string, userId: string) {
    const user = await this.userModel
      .findOne({
        _id: new Types.ObjectId(userId),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .exec();
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const tempPassword = generateTempPassword();
    user.passwordHash = await argon2.hash(tempPassword);
    user.mustChangePassword = true;
    await user.save();

    // Close any pending reset requests for this clinic.
    await this.resetRequestModel
      .updateMany(
        { clinicId: new Types.ObjectId(clinicId), resolvedAt: null },
        { resolvedAt: new Date() },
      )
      .exec();

    return { username: user.username ?? null, tempPassword };
  }

  async deactivateClinicUser(clinicId: string, userId: string) {
    const user = await this.userModel
      .findOne({
        _id: new Types.ObjectId(userId),
        clinicId: new Types.ObjectId(clinicId),
        deletedAt: null,
      })
      .exec();
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.role === UserRole.OWNER) {
      throw new BadRequestException(
        'No se puede eliminar al titular (OWNER) de la clínica',
      );
    }
    user.deletedAt = new Date();
    await user.save();
    return { ok: true };
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
      sub: owner._id.toString(),
      email: owner.email,
      clinicId: owner.clinicId.toString(),
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

    const clinicIds = [...new Set(requests.map((r) => r.clinicId.toString()))];
    const userIds = [...new Set(requests.map((r) => r.userId.toString()))];
    const [clinics, users] = await Promise.all([
      this.clinicModel
        .find({ _id: { $in: clinicIds } })
        .lean()
        .exec(),
      this.userModel
        .find({ _id: { $in: userIds } })
        .lean()
        .exec(),
    ]);
    const clinicMap = new Map(clinics.map((c) => [c._id.toString(), c]));
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    return requests.map((r) => {
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
        user: user
          ? { name: user.name, username: user.username ?? null }
          : null,
      };
    });
  }

  async resolvePasswordResetRequest(id: string) {
    const req = await this.resetRequestModel.findById(id).exec();
    if (!req) throw new NotFoundException('Pedido no encontrado');
    if (req.resolvedAt)
      return { _id: req._id.toString(), resolvedAt: req.resolvedAt };
    req.resolvedAt = new Date();
    await req.save();
    return { _id: req._id.toString(), resolvedAt: req.resolvedAt };
  }

  async countPendingPasswordResetRequests() {
    const count = await this.resetRequestModel
      .countDocuments({ resolvedAt: null })
      .exec();
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
      this.clinicModel.countDocuments({
        deletedAt: null,
        status: SubscriptionStatus.ACTIVE,
      }),
      this.clinicModel.countDocuments({
        deletedAt: null,
        status: SubscriptionStatus.TRIAL,
      }),
      this.clinicModel.countDocuments({
        deletedAt: null,
        status: SubscriptionStatus.SUSPENDED,
      }),
      this.userModel.countDocuments({ deletedAt: null }),
      this.clinicModel
        .find({ deletedAt: null })
        .select('subscriptionEndsAt status createdAt')
        .exec(),
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
