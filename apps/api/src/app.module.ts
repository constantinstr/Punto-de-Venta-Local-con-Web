import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { QueueDemoModule } from './queue-demo/queue-demo.module';
import { AuthModule } from './auth/auth.module';
import { StoresModule } from './stores/stores.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { StockModule } from './stock/stock.module';
import { CashRegistersModule } from './cash-registers/cash-registers.module';
import { CashShiftsModule } from './cash-shifts/cash-shifts.module';
import { OrdersModule } from './orders/orders.module';
import { FiscalConfigModule } from './fiscal-config/fiscal-config.module';
import { InvoicesModule } from './invoices/invoices.module';
import { CustomersModule } from './customers/customers.module';
import { WooCommerceModule } from './woocommerce/woocommerce.module';
import { TiendanubeModule } from './tiendanube/tiendanube.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { EncryptionModule } from './common/crypto/encryption.module';
import { BillingModule } from './billing/billing.module';
import { SubscriptionEnforcementInterceptor } from './billing/subscription-enforcement.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite estándar de alta concurrencia para el resto de la API (POS
    // general) — las rutas de auth y el webhook de WooCommerce lo
    // sobreescriben puntualmente con @Throttle() a límites más estrictos
    // (ver auth.controller.ts y woo-webhook.controller.ts).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    // @Global: lo consumen FiscalConfigService (al guardar) y AfipAuthService
    // (al firmar), que viven en módulos sin relación entre sí.
    EncryptionModule,
    HealthModule,
    QueueDemoModule,
    AuthModule,
    StoresModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    StockModule,
    CashRegistersModule,
    CashShiftsModule,
    OrdersModule,
    FiscalConfigModule,
    InvoicesModule,
    CustomersModule,
    WooCommerceModule,
    TiendanubeModule,
    // Fan-out de sincronización hacia todos los canales online (lo consumen
    // ventas, stock, compras y precios).
    IntegrationsModule,
    ReportsModule,
    AuditModule,
    SuppliersModule,
    PurchasesModule,
    BillingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    // Interceptor y no guard: los guards globales corren ANTES que el
    // JwtAuthGuard de cada controller y no tendrían req.user. Ver el
    // comentario largo en SubscriptionEnforcementInterceptor.
    {
      provide: APP_INTERCEPTOR,
      useClass: SubscriptionEnforcementInterceptor,
    },
  ],
})
export class AppModule {}
