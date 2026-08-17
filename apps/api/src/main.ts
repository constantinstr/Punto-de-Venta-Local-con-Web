import { join } from 'node:path';
import type { ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './common/cors-origins.util';

async function bootstrap() {
  // rawBody: true — el webhook de WooCommerce (ver
  // woocommerce/woo-webhook.controller.ts) necesita los bytes exactos del
  // body para verificar la firma HMAC; el body ya parseado a JSON no sirve
  // porque re-serializarlo no reproduce byte a byte lo que WooCommerce firmó.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: parseCorsOrigins(process.env.CORS_ORIGIN),
    credentials: true,
  });

  // Imágenes de producto subidas por el usuario (ver
  // products.controller.ts) — servidas como archivos estáticos, sin lógica
  // de negocio en el GET. pos-web las carga desde otro origen (puerto
  // 3000) vía <img src>: sin el override de CORP, el
  // "Cross-Origin-Resource-Policy: same-origin" que pone helmet() arriba
  // (aplica a toda la app) bloquearía la carga en Chrome.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res: ServerResponse) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
