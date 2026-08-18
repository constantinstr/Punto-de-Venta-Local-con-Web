import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { DemoPurgeService } from './demo-purge.service';
import { DemoCleanupQueueService } from './demo-cleanup.queue';
import { DemoCleanupWorkerService } from './demo-cleanup.worker';

// No importa BillingModule: la provisión no necesita PlanService ni
// SubscriptionService (setea planTier/demoExpiresAt directo), y el
// enforcement de límites vive en los módulos que exponen cada función
// (Invoices, WooCommerce, Tienda Nube, Products, Stores), no acá.
@Module({
  imports: [AuthModule],
  controllers: [DemoController],
  providers: [
    DemoService,
    DemoPurgeService,
    DemoCleanupQueueService,
    DemoCleanupWorkerService,
  ],
  exports: [DemoPurgeService],
})
export class DemoModule {}
