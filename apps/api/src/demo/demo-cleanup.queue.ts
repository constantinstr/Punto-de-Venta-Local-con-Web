import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { getRedisConnection } from '../redis/redis-connection';

// Configurable por env var, mismo motivo que WOO_QUEUE_NAME
// (woo-queue.service.ts): Jest corre los *.e2e-spec.ts en procesos paralelos
// contra el mismo Redis, y si todos usaran el nombre fijo se robarían jobs
// entre sí.
export function getDemoCleanupQueueName(): string {
  return process.env.DEMO_CLEANUP_QUEUE_NAME ?? 'demo-cleanup-queue';
}

const DAILY_CLEANUP_JOB = 'purge-expired-demos';
// 04:00 todos los días — fuera de horario comercial habitual, para no
// competir por conexiones de base con el tráfico real.
const DAILY_CRON_PATTERN = '0 4 * * *';

@Injectable()
export class DemoCleanupQueueService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(DemoCleanupQueueService.name);
  private queue: Queue | undefined;

  async onModuleInit(): Promise<void> {
    this.queue = new Queue(getDemoCleanupQueueName(), {
      connection: getRedisConnection(),
    });

    // upsertJobScheduler es idempotente por diseño: no importa cuántas veces
    // reinicie el proceso la API, sigue habiendo UN solo scheduler repetible
    // con este id, no uno nuevo por reinicio.
    await this.queue.upsertJobScheduler(
      DAILY_CLEANUP_JOB,
      { pattern: DAILY_CRON_PATTERN },
      { name: DAILY_CLEANUP_JOB, data: {} },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }
}
