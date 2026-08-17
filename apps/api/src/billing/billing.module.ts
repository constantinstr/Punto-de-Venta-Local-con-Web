import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { PlatformController } from './platform.controller';
import { MpWebhookController } from './mp-webhook.controller';
import { SubscriptionService } from './subscription.service';
import { MercadoPagoService } from './mercadopago.service';

@Module({
  controllers: [BillingController, PlatformController, MpWebhookController],
  providers: [SubscriptionService, MercadoPagoService],
  // SubscriptionService se exporta porque lo consumen AuthService (para
  // setear el trial al dar de alta) y el SubscriptionGuard global.
  exports: [SubscriptionService],
})
export class BillingModule {}
