import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportMailerService } from './support-mailer.service';

@Module({
  controllers: [SupportController],
  providers: [SupportService, SupportMailerService],
  // SupportService se exporta porque PlatformController (en BillingModule)
  // lo usa para listar/resolver mensajes desde /platform.
  exports: [SupportService],
})
export class SupportModule {}
