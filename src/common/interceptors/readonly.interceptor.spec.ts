import { ForbiddenException } from '@nestjs/common';
import { of } from 'rxjs';
import { ReadonlyInterceptor } from './readonly.interceptor';
import { SubscriptionStatus } from '../../modules/clinics/schemas/clinic.schema';
import { READONLY_AFTER_DAYS, BLOCK_AFTER_DAYS } from '../subscription.policy';

const DIA = 86_400_000;
const CLINIC_ID = '6a29ad9afe690045619b7bf9';

/**
 * Esto corta el trabajo del consultorio, así que los dos errores cuestan caro y
 * en direcciones opuestas: si bloquea de menos, el escalón de mora es
 * decorativo; si bloquea de más, deja a un odontólogo sin poder cargar nada con
 * el paciente en el sillón.
 */
describe('ReadonlyInterceptor', () => {
  /** Espía el handler: pasar = se llamó; bloquear = no se llamó nunca. */
  let handler: { handle: jest.Mock };

  beforeEach(() => {
    handler = { handle: jest.fn(() => of('resultado')) };
  });

  function armar(clinic: unknown) {
    const model = {
      findById: () => ({
        select: () => ({
          lean: () => ({ exec: () => Promise.resolve(clinic) }),
        }),
      }),
    };
    return new ReadonlyInterceptor(model as never);
  }

  const ctx = (req: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as never;

  const vencidoHace = (dias: number) => ({
    status: SubscriptionStatus.ACTIVE,
    subscriptionEndsAt: new Date(Date.now() - dias * DIA - 3600_000),
  });

  const pedido = (method: string, extra: Record<string, unknown> = {}) => ({
    method,
    path: '/patients',
    user: { clinicId: CLINIC_ID },
    ...extra,
  });

  const corre = (i: ReadonlyInterceptor, req: unknown) =>
    i.intercept(ctx(req), handler as never);

  it('deja pasar las LECTURAS aunque esté en solo lectura', async () => {
    // Es toda la diferencia entre "solo lectura" y "bloqueado": tiene que poder
    // mirar la historia clínica del paciente que tiene enfrente.
    const i = armar(vencidoHace(READONLY_AFTER_DAYS + 2));
    await corre(i, pedido('GET'));
    expect(handler.handle).toHaveBeenCalled();
  });

  it('corta las escrituras cuando está en solo lectura', async () => {
    const i = armar(vencidoHace(READONLY_AFTER_DAYS + 2));
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      await expect(corre(i, pedido(m))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
    // No alcanza con que rechace: el handler no se tiene que haber ejecutado,
    // o el dato se guardaría igual y el error sería puro teatro.
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('deja escribir mientras todavía no llegó al corte', async () => {
    const i = armar(vencidoHace(READONLY_AFTER_DAYS - 1));
    await corre(i, pedido('POST'));
    expect(handler.handle).toHaveBeenCalled();
  });

  it('deja escribir a una cuenta al día', async () => {
    const i = armar({
      status: SubscriptionStatus.ACTIVE,
      subscriptionEndsAt: new Date(Date.now() + 10 * DIA),
    });
    await corre(i, pedido('POST'));
    expect(handler.handle).toHaveBeenCalled();
  });

  it('una prueba vencida también queda en solo lectura', async () => {
    const i = armar({
      status: SubscriptionStatus.TRIAL,
      trialEndsAt: new Date(Date.now() - (READONLY_AFTER_DAYS + 1) * DIA),
    });
    await expect(corre(i, pedido('POST'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('nunca bloquea /auth: si no, no podría ni renovar sesión o salir', async () => {
    const i = armar(vencidoHace(READONLY_AFTER_DAYS + 2));
    await corre(i, pedido('POST', { path: '/auth/refresh' }));
    expect(handler.handle).toHaveBeenCalled();
  });

  it('no toca las requests sin JWT de clínica (backoffice, webhooks)', async () => {
    // El backoffice edita consultorios en mora justamente para sacarlos de ahí:
    // bloquearlo sería impedir cobrar.
    const i = armar(vencidoHace(BLOCK_AFTER_DAYS + 5));
    await corre(i, {
      method: 'POST',
      path: '/admin/clinics/x/payment',
      user: undefined,
    });
    expect(handler.handle).toHaveBeenCalled();
  });

  it('pasado el bloqueo total TAMBIÉN corta (no se afloja al día 30)', async () => {
    // `blocked` es más restrictivo que `readonly`, no otra rama. Cuando se
    // comparaba solo contra 'readonly', al cruzar el día 30 la cuenta volvía a
    // poder escribir: el login la frenaba, pero una sesión ya abierta se
    // renueva sin re-mirar la clínica y seguía trabajando.
    const i = armar(vencidoHace(BLOCK_AFTER_DAYS + 2));
    await expect(corre(i, pedido('POST'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('la suspensión manual también corta las escrituras', async () => {
    const i = armar({
      status: SubscriptionStatus.SUSPENDED,
      subscriptionEndsAt: new Date(Date.now() + 30 * DIA),
    });
    await expect(corre(i, pedido('POST'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('el rechazo viaja con code, no solo con texto', async () => {
    // El front distingue ESTE 403 de uno de permisos por el código, y de eso
    // depende que el Dr. vea "falta de pago" y no "no se pudo crear el
    // paciente". Si el código cambia, el aviso vuelve a ser engañoso.
    const i = armar(vencidoHace(READONLY_AFTER_DAYS + 2));
    await expect(corre(i, pedido('POST'))).rejects.toMatchObject({
      response: { code: 'ACCOUNT_READONLY' },
    });
  });

  it('lee la clínica del JWT, no de un campo que nadie llena', async () => {
    // El bug que hizo cambiar guard por interceptor: como guard global corría
    // antes del JwtAuthGuard, `request.user` venía undefined y TODA escritura
    // pasaba. Si algún día vuelve a ejecutarse antes de la auth, este test cae.
    const i = armar(vencidoHace(READONLY_AFTER_DAYS + 2));
    await expect(corre(i, pedido('POST'))).rejects.toThrow(/solo lectura/);
  });
});
