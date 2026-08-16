import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';

@Module({
  imports: [WooCommerceModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
