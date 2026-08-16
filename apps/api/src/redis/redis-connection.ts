import type { RedisOptions } from 'ioredis';

// Connection options compartidas por todas las colas BullMQ del módulo sync
// y afip-worker (ver docs/woocommerce-sync.md y docs/afip.md). RedisOptions
// es asignable a ConnectionOptions de bullmq (uno de los miembros de su unión).
export function getRedisConnection(): RedisOptions {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
  };
}
