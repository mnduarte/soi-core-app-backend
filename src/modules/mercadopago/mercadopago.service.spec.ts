import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoService } from './mercadopago.service';

const SECRET = 'clave-de-prueba';

function firmar(
  dataId: string,
  requestId: string,
  ts: string,
  secret = SECRET,
) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

// La firma es lo único que separa un cobro real de uno inventado: el webhook es
// público y lo que procesa extiende suscripciones. Vale tenerlo cubierto.
describe('MercadoPagoService.verifySignature', () => {
  const conConfig = (secret?: string) =>
    new MercadoPagoService(
      { get: () => secret } as unknown as ConfigService,
      {} as never,
      {} as never,
    );

  const svc = conConfig(SECRET);
  const TS = '1756000000';
  const RID = 'req-abc';
  const ID = '99887766';

  it('acepta una firma válida', () => {
    const v1 = firmar(ID, RID, TS);
    expect(svc.verifySignature(`ts=${TS},v1=${v1}`, RID, ID)).toBe(true);
  });

  it('tolera espacios alrededor de los valores del header', () => {
    const v1 = firmar(ID, RID, TS);
    expect(svc.verifySignature(` ts=${TS} , v1=${v1} `, RID, ID)).toBe(true);
  });

  it('pasa los ids alfanuméricos a minúscula, como hace Mercado Pago', () => {
    const v1 = firmar('abc123', RID, TS);
    expect(svc.verifySignature(`ts=${TS},v1=${v1}`, RID, 'ABC123')).toBe(true);
  });

  it('rechaza si cambia el id (una notificación reapuntada a otro cobro)', () => {
    const v1 = firmar(ID, RID, TS);
    expect(svc.verifySignature(`ts=${TS},v1=${v1}`, RID, '11112222')).toBe(
      false,
    );
  });

  it('rechaza si cambia el request-id', () => {
    const v1 = firmar(ID, RID, TS);
    expect(svc.verifySignature(`ts=${TS},v1=${v1}`, 'otro-req', ID)).toBe(
      false,
    );
  });

  it('rechaza una firma hecha con otro secreto', () => {
    const v1 = firmar(ID, RID, TS, 'secreto-ajeno');
    expect(svc.verifySignature(`ts=${TS},v1=${v1}`, RID, ID)).toBe(false);
  });

  it('rechaza si falta el header o está incompleto', () => {
    expect(svc.verifySignature(undefined, RID, ID)).toBe(false);
    expect(svc.verifySignature(`ts=${TS}`, RID, ID)).toBe(false);
    expect(svc.verifySignature(`v1=abc`, RID, ID)).toBe(false);
  });

  it('rechaza todo si el servidor no tiene el secreto configurado', () => {
    const sinSecreto = conConfig(undefined);
    const v1 = firmar(ID, RID, TS);
    expect(sinSecreto.verifySignature(`ts=${TS},v1=${v1}`, RID, ID)).toBe(
      false,
    );
  });
});
