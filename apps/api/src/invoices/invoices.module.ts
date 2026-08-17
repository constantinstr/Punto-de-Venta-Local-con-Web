import { Module } from '@nestjs/common';
import { AfipModule } from '../afip/afip.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [AfipModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  // OrdersService lo usa para emitir la nota de crédito al anular una venta
  // facturada. La dependencia va en un solo sentido (Orders -> Invoices):
  // InvoicesService trabaja contra Prisma directo, no contra OrdersService,
  // así que no hay ciclo.
  exports: [InvoicesService],
})
export class InvoicesModule {}
