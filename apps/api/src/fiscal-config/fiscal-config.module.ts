import { Module } from '@nestjs/common';
import { FiscalConfigController } from './fiscal-config.controller';
import { FiscalConfigService } from './fiscal-config.service';

@Module({
  controllers: [FiscalConfigController],
  providers: [FiscalConfigService],
  exports: [FiscalConfigService],
})
export class FiscalConfigModule {}
