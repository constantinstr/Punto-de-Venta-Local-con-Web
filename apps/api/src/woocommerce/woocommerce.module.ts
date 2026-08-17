import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WooConfigController } from './woo-config.controller';
import { WooConfigService } from './woo-config.service';
import { WooIntegrationController } from './woo-integration.controller';
import { WooWebhookController } from './woo-webhook.controller';
import { WooCatalogSyncService } from './woo-catalog-sync.service';
import { WooStockSyncService } from './woo-stock-sync.service';
import { WooPriceSyncService } from './woo-price-sync.service';
import { WooQueueService } from './woo-queue.service';
import { WooWorkerService } from './woo-worker.service';
import { SyncLogService } from './sync-log.service';
import { WooRestGateway } from './woo-rest.gateway';
import { WooMockGateway } from './woo-mock.gateway';
import { WOO_GATEWAY } from './woo-gateway.interface';

// WOO_GATEWAY apunta al gateway REST real por defecto. Con WOO_MOCK=true en
// el entorno (útil para desarrollo/demo sin una tienda WooCommerce real a
// mano) usa el mock. Los tests e2e no dependen de esta variable —
// overridean el token directamente vía Nest Testing Module (mismo patrón
// que AfipModule, ver test/woocommerce.e2e-spec.ts).
@Module({
  imports: [ConfigModule],
  controllers: [
    WooConfigController,
    WooIntegrationController,
    WooWebhookController,
  ],
  providers: [
    WooConfigService,
    WooCatalogSyncService,
    WooStockSyncService,
    WooPriceSyncService,
    WooQueueService,
    WooWorkerService,
    SyncLogService,
    WooRestGateway,
    WooMockGateway,
    {
      provide: WOO_GATEWAY,
      inject: [ConfigService, WooRestGateway, WooMockGateway],
      useFactory: (
        config: ConfigService,
        restGateway: WooRestGateway,
        mockGateway: WooMockGateway,
      ) =>
        config.get<string>('WOO_MOCK') === 'true' ? mockGateway : restGateway,
    },
  ],
  exports: [WooStockSyncService, WooPriceSyncService],
})
export class WooCommerceModule {}
