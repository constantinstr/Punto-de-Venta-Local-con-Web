import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import Redis from 'ioredis';
import { getRedisConnection } from '../redis/redis-connection';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    const client = new Redis({
      ...getRedisConnection(),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    const start = Date.now();
    try {
      await client.connect();
      await client.ping();
      return indicator.up({ latencyMs: Date.now() - start });
    } catch (err) {
      return indicator.down({ message: String(err) });
    } finally {
      client.disconnect();
    }
  }
}
