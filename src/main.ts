import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

// Local dev defaults — overridden in production by the FRONTEND_URLS env var.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'];

function parseAllowedOrigins(): string[] {
  // Comma-separated list (e.g.
  //   FRONTEND_URLS=https://app.soi.com,https://console.soi.com
  // ) so a single env var holds all production origins. We always
  // keep the dev origins so a `fly ssh console` session targeting
  // the prod app from a local browser still works.
  const fromEnv = (process.env.FRONTEND_URLS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return [...new Set([...DEV_ORIGINS, ...fromEnv])];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Allow larger JSON bodies — the "scan ficha" feature posts a base64 image
  // (a downscaled photo is a few hundred KB, well over the 100kb default).
  app.useBodyParser('json', { limit: '12mb' });

  app.enableCors({
    origin: parseAllowedOrigins(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Bind to 0.0.0.0 so Fly.io's load balancer (and any container runtime)
  // can reach the process from outside the container. Locally this still
  // resolves to localhost from the browser.
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`SOI backend listening on 0.0.0.0:${port}`);
}

bootstrap();
