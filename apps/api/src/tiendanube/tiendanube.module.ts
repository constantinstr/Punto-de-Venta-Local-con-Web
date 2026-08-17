import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TnConfigController } from './tn-config.controller';
import { TnOAuthController } from './tn-oauth.controller';
import { TnWebhookController } from './tn-webhook.controller';
import { TnConfigService } from './tn-config.service';
import { TnCatalogSyncService } from './tn-catalog-sync.service';
import { TnStockSyncService } from './tn-stock-sync.service';
import { TnQueueService } from './tn-queue.service';
import { TnWorkerService } from './tn-worker.service';
import { TnWebhookRegistrarService } from './tn-webhook-registrar.service';
import { TnRestGateway } from './tn-rest.gateway';
import { TnMockGateway } from './tn-mock.gateway';
import { TIENDANUBE_GATEWAY } from './tiendanube-gateway.interface';

// TIENDANUBE_GATEWAY apunta al cliente real por defecto. Con
// TIENDANUBE_MOCK=true usa el simulador — que es lo que permite desarrollar y
// probar la integración completa sin esperar a que Tienda Nube apruebe la app
// de partner. Los tests e2e no dependen de esa variable: overridean el token
// vía Nest Testing Module (mismo patrón que AfipModule y WooCommerceModule).
@Module({
  imports: [
    ConfigModule,
    // Firma el `state` de OAuth y el token que va en la URL de los webhooks.
    // Ver los comentarios de STATE_PURPOSE (tn-oauth.controller.ts) y
    // WEBHOOK_TOKEN_PURPOSE (tn-webhook.controller.ts) sobre por qué compartir
    // el secreto con los tokens de sesión es seguro acá.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [TnConfigController, TnOAuthController, TnWebhookController],
  providers: [
    TnConfigService,
    TnCatalogSyncService,
    TnStockSyncService,
    TnQueueService,
    TnWorkerService,
    TnWebhookRegistrarService,
    TnRestGateway,
    TnMockGateway,
    {
      provide: TIENDANUBE_GATEWAY,
      inject: [ConfigService, TnRestGateway, TnMockGateway],
      useFactory: (
        config: ConfigService,
        restGateway: TnRestGateway,
        mockGateway: TnMockGateway,
      ) =>
        config.get<string>('TIENDANUBE_MOCK') === 'true'
          ? mockGateway
          : restGateway,
    },
  ],
  exports: [TnStockSyncService],
})
export class TiendanubeModule {}
