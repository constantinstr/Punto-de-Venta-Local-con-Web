import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';

@Module({
  imports: [WooCommerceModule],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
