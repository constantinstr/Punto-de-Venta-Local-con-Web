import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
