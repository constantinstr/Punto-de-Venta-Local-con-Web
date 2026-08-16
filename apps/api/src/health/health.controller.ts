import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { prisma } from '@pos/database';
import Redis from 'ioredis';
import { getRedisConnection } from '../redis/redis-connection';

@Controller('health')
export class HealthController {
  @Get()
  async check() {
    const [dbOk, redisOk] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
    ]);

    if (!dbOk || !redisOk) {
      throw new ServiceUnavailableException({ db: dbOk, redis: redisOk });
    }

    return { status: 'ok', db: dbOk, redis: redisOk };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    const client = new Redis({
      ...getRedisConnection(),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    try {
      await client.connect();
      await client.ping();
      return true;
    } catch {
      return false;
    } finally {
      client.disconnect();
    }
  }
}
