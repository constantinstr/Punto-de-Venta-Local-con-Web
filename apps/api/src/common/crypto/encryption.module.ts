import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

// Global: lo necesitan tanto FiscalConfigService (al guardar) como
// AfipAuthService (al firmar), en módulos distintos y sin relación entre sí.
@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
