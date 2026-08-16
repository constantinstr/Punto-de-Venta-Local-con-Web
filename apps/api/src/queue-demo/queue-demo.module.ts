import { Module, OnApplicationShutdown } from '@nestjs/common';
import { QueueDemoController } from './queue-demo.controller';
import { queueDemoQueue, queueDemoWorker } from './queue-demo.queue';

// Prueba de vida del pipeline BullMQ+Redis (Sprint 0). Los módulos reales
// (sync WooCommerce, AFIP) reemplazan esto — ver docs/woocommerce-sync.md y
// docs/afip.md — pero el patrón de conexión/worker es el mismo.
@Module({
  controllers: [QueueDemoController],
})
export class QueueDemoModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await queueDemoWorker.close();
    await queueDemoQueue.close();
  }
}
