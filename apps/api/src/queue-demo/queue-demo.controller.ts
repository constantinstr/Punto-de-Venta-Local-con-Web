import { Body, Controller, Post } from '@nestjs/common';
import { queueDemoQueue } from './queue-demo.queue';

@Controller('queue-demo')
export class QueueDemoController {
  @Post()
  async enqueue(@Body() body: Record<string, unknown>) {
    const job = await queueDemoQueue.add(
      'hello-world',
      body ?? { message: 'hello world' },
    );
    return { jobId: job.id };
  }
}
