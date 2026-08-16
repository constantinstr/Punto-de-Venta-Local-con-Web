import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './common/cors-origins.util';

async function bootstrap() {
  // rawBody: true — el webhook de WooCommerce (ver
  // woocommerce/woo-webhook.controller.ts) necesita los bytes exactos del
  // body para verificar la firma HMAC; el body ya parseado a JSON no sirve
  // porque re-serializarlo no reproduce byte a byte lo que WooCommerce firmó.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: parseCorsOrigins(process.env.CORS_ORIGIN),
    credentials: true,
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
