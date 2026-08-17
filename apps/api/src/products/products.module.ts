import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';

@Module({
  imports: [WooCommerceModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
