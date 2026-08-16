import { Module } from '@nestjs/common';
import { CashRegistersController } from './cash-registers.controller';
import { CashRegistersService } from './cash-registers.service';

@Module({
  controllers: [CashRegistersController],
  providers: [CashRegistersService],
})
export class CashRegistersModule {}
