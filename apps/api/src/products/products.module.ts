import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsImportService } from './products-import.service';
import { ProductsBulkPriceService } from './products-bulk-price.service';
import { BundlePricingService } from './bundle-pricing.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [IntegrationsModule, AuditModule],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductsImportService,
    ProductsBulkPriceService,
    BundlePricingService,
  ],
})
export class ProductsModule {}
