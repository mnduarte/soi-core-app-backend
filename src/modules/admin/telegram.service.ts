import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Thin wrapper around api.telegram.org's sendMessage. The bot token + chat ID
// live in env vars (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID); if either is
// missing we log a warning and noop so local dev without Telegram still
// boots cleanly.
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly config: ConfigService) {}

  async notify(text: string): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    const chatId = this.config.get<string>('TELEGRAM_CHAT_ID');

    if (!token || !chatId) {
      this.logger.warn(
        '[TELEGRAM] no configurado — saltando notificación: ' + text.split('\n')[0],
      );
      return;
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`[TELEGRAM] fallo (${res.status}): ${body}`);
      }
    } catch (err) {
      // Notification failures are non-fatal — the BO inbox is the source of
      // truth, Telegram is only the push channel.
      this.logger.error('[TELEGRAM] error al enviar', err as Error);
    }
  }
}
