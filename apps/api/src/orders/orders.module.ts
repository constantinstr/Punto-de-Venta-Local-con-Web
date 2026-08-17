import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AuditModule } from '../audit/audit.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { DiscountsModule } from '../discounts/discounts.module';

@Module({
  // InvoicesModule: para emitir la nota de crédito al anular una venta ya
  // facturada (ver OrdersService.cancel).
  // DiscountsModule: para validar el tope de descuento del rol que vende.
  imports: [IntegrationsModule, AuditModule, InvoicesModule, DiscountsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
