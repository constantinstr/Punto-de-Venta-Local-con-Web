import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { PlatformController } from './platform.controller';
import { MpWebhookController } from './mp-webhook.controller';
import { SubscriptionService } from './subscription.service';
import { MercadoPagoService } from './mercadopago.service';
import { PlanService } from './plan.service';
import { SupportModule } from '../support/support.module';

@Module({
  // PlatformController lista/resuelve mensajes de soporte desde /platform —
  // SupportModule ya exporta SupportService para eso.
  imports: [SupportModule],
  controllers: [BillingController, PlatformController, MpWebhookController],
  providers: [SubscriptionService, MercadoPagoService, PlanService],
  // SubscriptionService se exporta porque lo consumen AuthService (para
  // setear el trial al dar de alta) y el SubscriptionGuard global.
  // PlanService se exporta porque lo consumen InvoicesService,
  // EcommerceSyncService, ProductsService, StoresService y
  // PlanFeatureInterceptor (registrado global en AppModule).
  exports: [SubscriptionService, PlanService],
})
export class BillingModule {}
