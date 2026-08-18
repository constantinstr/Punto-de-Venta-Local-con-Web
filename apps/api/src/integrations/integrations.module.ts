import { Module } from '@nestjs/common';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';
import { TiendanubeModule } from '../tiendanube/tiendanube.module';
import { BillingModule } from '../billing/billing.module';
import { EcommerceSyncService } from './ecommerce-sync.service';

// Junta las integraciones de e-commerce detrás de un solo servicio, para que
// ventas/stock/compras/precios no tengan que conocer cada canal.
@Module({
  imports: [WooCommerceModule, TiendanubeModule, BillingModule],
  providers: [EcommerceSyncService],
  exports: [EcommerceSyncService],
})
export class IntegrationsModule {}
