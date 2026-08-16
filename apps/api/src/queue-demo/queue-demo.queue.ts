import { Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../redis/redis-connection';

const logger = new Logger('QueueDemo');

interface QueueDemoPayload {
  [key: string]: unknown;
}

export const queueDemoQueue = new Queue<QueueDemoPayload>('queue-demo', {
  connection: getRedisConnection(),
});

export const queueDemoWorker = new Worker<QueueDemoPayload>(
  'queue-demo',
  (job) => {
    logger.log(`Processing job ${job.id}: ${JSON.stringify(job.data)}`);
    return Promise.resolve({
      receivedAt: new Date().toISOString(),
      echo: job.data,
    });
  },
  { connection: getRedisConnection() },
);

queueDemoWorker.on('completed', (job) => {
  logger.log(`Job ${job.id} completed`);
});

queueDemoWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});
