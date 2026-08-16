import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { prisma } from '@pos/database';

@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return indicator.up({ latencyMs: Date.now() - start });
    } catch (err) {
      return indicator.down({ message: String(err) });
    }
  }
}
