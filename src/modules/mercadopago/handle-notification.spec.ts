import { ConfigService } from '@nestjs/config';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentMethod } from '../admin/schemas/clinic-payment.schema';
import { SubscriptionStatus } from '../clinics/schemas/clinic.schema';

/**
 * Procesamiento de un cobro automático.
 *
 * Es la parte que corre SOLA y toca plata, y la única que la prueba contra el
 * sandbox no alcanza a ejercitar (con un id inventado MP devuelve 404 y el
 * código corta antes). El escenario feo si esto falla: Mercado Pago le cobra
 * al consultorio, SOI no lo registra, y a los días lo marca como vencido y le
 * corta el acceso a alguien que pagó.
 */
describe('MercadoPagoService.handleNotification — cobro automático', () => {
  const CLINIC_ID = 'c1';
  const PREAPPROVAL = 'pre-123';

  function armar(opts: { respuestaMp: unknown; creaFalla?: { code: number } }) {
    const clinic = {
      _id: CLINIC_ID,
      name: 'Consultorio X',
      slug: 'consultorio-x',
      status: SubscriptionStatus.TRIAL,
      subscriptionEndsAt: undefined as Date | undefined,
      mpLastFailureAt: undefined as Date | undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const clinicModel = {
      findOne: jest
        .fn()
        .mockReturnValue({ exec: () => Promise.resolve(clinic) }),
    };
    const creados: Record<string, unknown>[] = [];
    const paymentModel = {
      create: jest.fn((doc: Record<string, unknown>) => {
        if (opts.creaFalla) return Promise.reject(opts.creaFalla);
        creados.push(doc);
        return Promise.resolve(doc);
      }),
    };

    const svc = new MercadoPagoService(
      {
        get: (k: string) => (k === 'MP_ACCESS_TOKEN' ? 'tok' : undefined),
      } as unknown as ConfigService,
      clinicModel as never,
      paymentModel as never,
    );
    // Se intercepta el fetch global: no queremos pegarle a Mercado Pago en un test.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(opts.respuestaMp)),
    }) as never;

    return { svc, clinic, paymentModel, creados };
  }

  const cobroOk = {
    id: 998877,
    preapproval_id: PREAPPROVAL,
    status: 'processed',
    transaction_amount: 40000,
    date_created: '2026-10-01T12:00:00.000Z',
  };

  it('asienta el pago con el monto y el medio correctos', async () => {
    const { svc, creados } = armar({ respuestaMp: cobroOk });
    await svc.handleNotification('subscription_authorized_payment', '998877');

    expect(creados).toHaveLength(1);
    expect(creados[0]).toMatchObject({
      amount: 40000,
      method: PaymentMethod.MERCADO_PAGO,
      mpPaymentId: '998877',
    });
  });

  it('deja la cuenta activa y corre el vencimiento un mes', async () => {
    const { svc, clinic } = armar({ respuestaMp: cobroOk });
    await svc.handleNotification('subscription_authorized_payment', '998877');

    expect(clinic.status).toBe(SubscriptionStatus.ACTIVE);
    const dias = (clinic.subscriptionEndsAt!.getTime() - Date.now()) / 86400000;
    expect(dias).toBeGreaterThan(27);
    expect(dias).toBeLessThan(32);
    expect(clinic.save).toHaveBeenCalled();
  });

  it('un reintento del mismo cobro no lo carga dos veces ni extiende de nuevo', async () => {
    // MP reintenta cada 15 minutos hasta recibir 200, así que la misma
    // notificación llega repetida. El índice único sobre mpPaymentId hace que
    // el segundo intento explote con 11000, y eso NO es un error.
    const { svc, clinic } = armar({
      respuestaMp: cobroOk,
      creaFalla: { code: 11000 },
    });
    await expect(
      svc.handleNotification('subscription_authorized_payment', '998877'),
    ).resolves.toBeUndefined();

    expect(clinic.save).not.toHaveBeenCalled();
    expect(clinic.subscriptionEndsAt).toBeUndefined();
  });

  it('un error de base que NO sea duplicado se propaga, para que MP reintente', async () => {
    const { svc } = armar({ respuestaMp: cobroOk, creaFalla: { code: 121 } });
    await expect(
      svc.handleNotification('subscription_authorized_payment', '998877'),
    ).rejects.toBeDefined();
  });

  it('un cobro rechazado no suspende la cuenta: solo deja la marca', async () => {
    const { svc, clinic, paymentModel } = armar({
      respuestaMp: {
        ...cobroOk,
        status: 'rejected',
        payment: { status: 'rejected' },
      },
    });
    await svc.handleNotification('subscription_authorized_payment', '998877');

    expect(paymentModel.create).not.toHaveBeenCalled();
    expect(clinic.status).toBe(SubscriptionStatus.TRIAL); // sin tocar
    expect(clinic.mpLastFailureAt).toBeInstanceOf(Date);
  });

  it('al autorizarse la suscripción no se cobra ni se extiende nada', async () => {
    // Autorizar es "puso la tarjeta", no "pagó": el primer cobro es en
    // start_date. Extender acá regalaría un mes.
    const { svc, clinic, paymentModel } = armar({
      respuestaMp: { id: PREAPPROVAL, status: 'authorized' },
    });
    await svc.handleNotification('subscription_preapproval', PREAPPROVAL);

    expect(paymentModel.create).not.toHaveBeenCalled();
    expect(clinic.subscriptionEndsAt).toBeUndefined();
  });
});
