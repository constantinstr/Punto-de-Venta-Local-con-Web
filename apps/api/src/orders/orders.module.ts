import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AuditModule } from '../audit/audit.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  // InvoicesModule: para emitir la nota de crédito al anular una venta ya
  // facturada (ver OrdersService.cancel).
  imports: [IntegrationsModule, AuditModule, InvoicesModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
