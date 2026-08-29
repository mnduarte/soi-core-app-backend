import { createHmac, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Clinic,
  ClinicDocument,
  SubscriptionStatus,
} from '../clinics/schemas/clinic.schema';
import {
  ClinicPayment,
  ClinicPaymentDocument,
  PaymentMethod,
} from '../admin/schemas/clinic-payment.schema';

const MP_API = 'https://api.mercadopago.com';

/** Error de la API de MP con su código, para poder distinguir 404 de caída. */
class MpHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Estados que devuelve MP para una suscripción (preapproval). */
export type PreapprovalStatus = 'pending' | 'authorized' | 'paused' | 'cancelled';

interface PreapprovalResponse {
  id: string;
  status: PreapprovalStatus;
  init_point?: string;
  next_payment_date?: string;
  auto_recurring?: { transaction_amount?: number };
}

interface AuthorizedPaymentResponse {
  id: number | string;
  preapproval_id: string;
  status: string;
  transaction_amount?: number;
  payment?: { id?: number | string; status?: string };
  date_created?: string;
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(
    private config: ConfigService,
    @InjectModel(Clinic.name) private clinicModel: Model<ClinicDocument>,
    @InjectModel(ClinicPayment.name)
    private paymentModel: Model<ClinicPaymentDocument>,
  ) {}

  private token(): string {
    const t = this.config.get<string>('MP_ACCESS_TOKEN');
    if (!t) {
      throw new BadRequestException(
        'Falta configurar MP_ACCESS_TOKEN en el servidor',
      );
    }
    return t;
  }

  private async mpFetch<T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const res = await fetch(`${MP_API}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${this.token()}`,
        'Content-Type': 'application/json',
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      // El cuerpo de MP trae el motivo real; sin loguearlo, depurar esto es
      // adivinar (los mensajes de error son bastante específicos).
      this.logger.error(`MP ${init?.method ?? 'GET'} ${path} → ${res.status} ${text}`);
      throw new MpHttpError(res.status, `Mercado Pago rechazó la operación (${res.status})`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /**
   * Traduce el error crudo de MP a uno de Nest.
   *
   * Lo usan las rutas del backoffice: sin esto el `MpHttpError` sale como 500
   * y el operador ve "error del servidor" cuando en realidad Mercado Pago
   * rechazó algo puntual y explicable. El webhook NO lo usa: ahí necesitamos
   * el código HTTP crudo para decidir si conviene que MP reintente.
   */
  private async mpCall<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof MpHttpError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  /**
   * Primer cobro: el 1° del mes siguiente a que termine la prueba.
   *
   * Se cobra a todos el mismo día del mes para tener una sola fecha que mirar,
   * en vez de una por consultorio según cuándo se dio de alta. Y anclarlo al
   * fin de la prueba evita cobrar un mes partido: la prueba absorbe los días
   * sueltos y no hace falta prorratear.
   */
  private firstChargeDate(clinic: Clinic): Date {
    // El ancla es lo ÚLTIMO que ya tiene cubierto: la prueba o lo que pagó.
    // Tomar solo `trialEndsAt` cobraba antes de tiempo a un consultorio al día
    // (prueba vencida en julio pero pago hasta el 21/09 → le cobraba el 1/09).
    // Y nunca antes de hoy, por si las dos fechas quedaron en el pasado.
    const cubierto = Math.max(
      clinic.trialEndsAt?.getTime() ?? 0,
      clinic.subscriptionEndsAt?.getTime() ?? 0,
      Date.now(),
    );
    const ref = new Date(cubierto);
    // Mediodía y no medianoche: con UTC-3, un 1° a las 00:00 local cae el
    // último día del mes anterior en UTC.
    return new Date(ref.getFullYear(), ref.getMonth() + 1, 1, 12, 0, 0);
  }

  /**
   * Crea la suscripción en MP y devuelve el link para que el consultorio
   * autorice. Se crea en `pending` a propósito: la alternativa (`authorized`)
   * exige mandar un token de tarjeta, o sea manejar datos de tarjeta acá. Con
   * el link, la tarjeta la carga el dentista en Mercado Pago y nunca pasa por
   * nuestro servidor.
   */
  async createSubscription(clinicId: string, amount: number) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    if (!clinic.contactEmail) {
      throw new BadRequestException(
        'El consultorio necesita un email de contacto para la suscripción',
      );
    }
    if (clinic.mpPreapprovalId && clinic.mpPreapprovalStatus !== 'cancelled') {
      throw new BadRequestException('Este consultorio ya tiene una suscripción activa');
    }

    const startDate = this.firstChargeDate(clinic);
    const body = {
      reason: `SOI — Suscripción mensual (${clinic.name})`,
      // Vuelve en el webhook: es cómo sabemos de qué consultorio es el cobro
      // sin depender de guardar el id nosotros primero.
      external_reference: clinic._id.toString(),
      payer_email: clinic.contactEmail,
      back_url: this.config.get<string>('MP_BACK_URL') ?? 'https://soi-odontologia-integral.vercel.app',
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: amount,
        currency_id: 'ARS',
        start_date: startDate.toISOString(),
      },
    };

    const pre = await this.mpCall(() =>
      this.mpFetch<PreapprovalResponse>('/preapproval', { method: 'POST', body }),
    );

    clinic.mpPreapprovalId = pre.id;
    clinic.mpPreapprovalStatus = pre.status;
    clinic.mpInitPoint = pre.init_point;
    clinic.mpFirstChargeAt = startDate;
    await clinic.save();

    return {
      preapprovalId: pre.id,
      status: pre.status,
      initPoint: pre.init_point,
      firstChargeAt: startDate,
      amount,
    };
  }

  /** Cancela en MP y desvincula. Cancelar es definitivo: no se reactiva. */
  async cancelSubscription(clinicId: string) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic) throw new NotFoundException('Clínica no encontrada');
    if (!clinic.mpPreapprovalId) {
      throw new BadRequestException('Este consultorio no tiene suscripción');
    }
    await this.mpCall(() =>
      this.mpFetch(`/preapproval/${clinic.mpPreapprovalId}`, {
        method: 'PUT',
        body: { status: 'cancelled' },
      }),
    );
    clinic.mpPreapprovalStatus = 'cancelled';
    clinic.mpInitPoint = undefined;
    await clinic.save();
    return { ok: true };
  }

  /** Relee el estado en MP (por si se autorizó y el webhook no llegó). */
  async syncSubscription(clinicId: string) {
    const clinic = await this.clinicModel
      .findOne({ _id: new Types.ObjectId(clinicId), deletedAt: null })
      .exec();
    if (!clinic?.mpPreapprovalId) {
      throw new BadRequestException('Este consultorio no tiene suscripción');
    }
    const pre = await this.mpCall(() =>
      this.mpFetch<PreapprovalResponse>(`/preapproval/${clinic.mpPreapprovalId}`),
    );
    clinic.mpPreapprovalStatus = pre.status;
    await clinic.save();
    return { status: pre.status, nextPaymentDate: pre.next_payment_date ?? null };
  }

  // ---------------------------------------------------------------------------
  // Webhook
  // ---------------------------------------------------------------------------

  /**
   * Valida la firma del webhook.
   *
   * MP firma con HMAC-SHA256 sobre `id:{data.id};request-id:{x-request-id};ts:{ts};`
   * usando la clave secreta de la aplicación. Sin esto, cualquiera que conozca
   * la URL puede inventar cobros — y estos cobros extienden suscripciones.
   */
  verifySignature(
    signature: string | undefined,
    requestId: string | undefined,
    dataId: string | undefined,
  ): boolean {
    const secret = this.config.get<string>('MP_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('MP_WEBHOOK_SECRET sin configurar: se rechaza la notificación');
      return false;
    }
    if (!signature || !dataId) return false;

    const parts = Object.fromEntries(
      signature.split(',').map((kv) => {
        const [k, v] = kv.split('=');
        return [k?.trim(), v?.trim()];
      }),
    ) as { ts?: string; v1?: string };
    if (!parts.ts || !parts.v1) return false;

    // Los ids alfanuméricos van en minúscula según la doc de MP.
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId ?? ''};ts:${parts.ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(parts.v1, 'utf8');
    // Comparación de tiempo constante: un `===` filtra información por el
    // tiempo que tarda en fallar.
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Procesa una notificación ya validada.
   *
   * Idempotente: MP reintenta cada 15 minutos hasta recibir un 200, así que la
   * misma notificación llega varias veces. El índice único sobre `mpPaymentId`
   * es lo que evita que un reintento cargue el pago dos veces.
   */
  async handleNotification(type: string, dataId: string) {
    // Un 404 de MP es definitivo: el recurso no existe y no va a existir. Si lo
    // dejáramos propagar, el controller devuelve 500 y MP reintenta cada 15
    // minutos durante días una notificación que nunca vamos a poder procesar.
    const noExiste = (e: unknown) => e instanceof MpHttpError && e.status === 404;

    if (type === 'subscription_preapproval') {
      let pre: PreapprovalResponse;
      try {
        pre = await this.mpFetch<PreapprovalResponse>(`/preapproval/${dataId}`);
      } catch (e) {
        if (noExiste(e)) {
          this.logger.warn(`Suscripción ${dataId} no existe en MP, se ignora`);
          return;
        }
        throw e;
      }
      const clinic = await this.clinicModel
        .findOne({ mpPreapprovalId: pre.id, deletedAt: null })
        .exec();
      if (!clinic) return;
      clinic.mpPreapprovalStatus = pre.status;
      // Autorizada = el dentista puso la tarjeta. No se cobra nada todavía
      // (el primer cobro es en `start_date`), así que no se toca la vigencia.
      if (pre.status === 'cancelled') clinic.mpInitPoint = undefined;
      await clinic.save();
      return;
    }

    if (type === 'subscription_authorized_payment') {
      let ap: AuthorizedPaymentResponse;
      try {
        ap = await this.mpFetch<AuthorizedPaymentResponse>(
          `/authorized_payments/${dataId}`,
        );
      } catch (e) {
        if (noExiste(e)) {
          this.logger.warn(`Cobro ${dataId} no existe en MP, se ignora`);
          return;
        }
        throw e;
      }
      const clinic = await this.clinicModel
        .findOne({ mpPreapprovalId: ap.preapproval_id, deletedAt: null })
        .exec();
      if (!clinic) {
        this.logger.warn(`Cobro ${dataId} sin consultorio asociado (${ap.preapproval_id})`);
        return;
      }

      const cobrado = ap.status === 'processed' || ap.payment?.status === 'approved';
      if (!cobrado) {
        // No se suspende automáticamente: MP reintenta unos días, y cortarle
        // el sistema al Dr. por un rechazo transitorio es peor que esperar.
        this.logger.warn(
          `Cobro rechazado — ${clinic.name} (${clinic.slug}): ${ap.status}`,
        );
        clinic.mpLastFailureAt = new Date();
        await clinic.save();
        return;
      }

      const amount = ap.transaction_amount ?? 0;
      const periodFrom = new Date();
      const periodTo = new Date(periodFrom);
      periodTo.setMonth(periodTo.getMonth() + 1);

      try {
        await this.paymentModel.create({
          clinicId: clinic._id,
          amount,
          paidAt: ap.date_created ? new Date(ap.date_created) : new Date(),
          method: PaymentMethod.MERCADO_PAGO,
          periodFrom,
          periodTo,
          mpPaymentId: String(ap.id),
        });
      } catch (e) {
        // 11000 = duplicado: ya lo habíamos asentado en un reintento anterior.
        // No es un error, es exactamente lo que el índice tiene que hacer.
        if ((e as { code?: number }).code === 11000) {
          this.logger.log(`Cobro ${ap.id} ya registrado, se ignora el reintento`);
          return;
        }
        throw e;
      }

      clinic.subscriptionEndsAt = periodTo;
      clinic.status = SubscriptionStatus.ACTIVE;
      clinic.mpLastFailureAt = undefined;
      await clinic.save();
      this.logger.log(`Cobro automático OK — ${clinic.slug} ${amount}`);
    }
  }
}
