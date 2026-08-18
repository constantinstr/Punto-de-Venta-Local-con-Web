import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { getRedisConnection } from '../redis/redis-connection';
import { getDemoCleanupQueueName } from './demo-cleanup.queue';
import { DemoPurgeService } from './demo-purge.service';

// Procesa el job repetible que encola DemoCleanupQueueService. La expiración
// LÓGICA no depende de este worker — SubscriptionEnforcementInterceptor ya
// bloquea cualquier demo vencida al instante (ver su comentario). Este
// worker solo libera espacio en la base; si está caído una semana, ningún
// dato se filtra entre tenants, solo se acumula basura hasta que vuelva a
// correr.
@Injectable()
export class DemoCleanupWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemoCleanupWorkerService.name);
  private worker: Worker | undefined;

  constructor(private readonly purgeService: DemoPurgeService) {}

  onModuleInit(): void {
    this.worker = new Worker(
      getDemoCleanupQueueName(),
      () => this.purgeService.purgeExpired(),
      { connection: getRedisConnection(), concurrency: 1 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Job de limpieza de demos ${job?.id} falló: ${err.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
