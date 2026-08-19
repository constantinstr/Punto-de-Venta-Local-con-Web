import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

// Global: lo necesitan SupportService y DemoService, en módulos distintos y
// sin relación entre sí — mismo criterio que EncryptionModule.
@Global()
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
