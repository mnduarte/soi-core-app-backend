import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { MercadoPagoService } from './mercadopago.service';

interface WebhookBody {
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string };
}

/**
 * Webhook de Mercado Pago.
 *
 * PÚBLICO a propósito: lo llama MP, que no tiene nuestro JWT. Lo que
 * reemplaza a la autenticación es la firma HMAC del header `x-signature`.
 * Por eso este controller vive fuera del módulo admin — si estuviera adentro
 * heredaría el AdminGuard y MP recibiría 401 en cada intento.
 */
@Controller('mp')
export class MercadoPagoController {
  private readonly logger = new Logger(MercadoPagoController.name);

  constructor(private mp: MercadoPagoService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-signature') signature: string,
    @Headers('x-request-id') requestId: string,
    @Query('data.id') queryDataId: string,
    @Body() body: WebhookBody,
  ) {
    const dataId = queryDataId ?? body?.data?.id;
    const type = body?.type ?? body?.topic;

    if (!this.mp.verifySignature(signature, requestId, dataId)) {
      // Se responde 200 igual: un 4xx hace que MP reintente cada 15 minutos
      // durante días una notificación que nunca vamos a aceptar. Queda el log.
      this.logger.warn(`Webhook con firma inválida (type=${type} id=${dataId})`);
      return { ok: true };
    }

    try {
      if (type && dataId) await this.mp.handleNotification(type, dataId);
    } catch (e) {
      // Acá SÍ conviene que reintente: fue un fallo nuestro (MP caído, base
      // fuera), no una notificación inválida. Se devuelve 500 para eso.
      this.logger.error(`Error procesando webhook ${type}/${dataId}`, e as Error);
      throw e;
    }
    return { ok: true };
  }
}
