import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true — el webhook de WooCommerce (ver
  // woocommerce/woo-webhook.controller.ts) necesita los bytes exactos del
  // body para verificar la firma HMAC; el body ya parseado a JSON no sirve
  // porque re-serializarlo no reproduce byte a byte lo que WooCommerce firmó.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors();
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
