import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { QueueDemoModule } from './queue-demo/queue-demo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    QueueDemoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
