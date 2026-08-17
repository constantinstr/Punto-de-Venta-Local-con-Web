import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [IntegrationsModule, AuditModule],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
