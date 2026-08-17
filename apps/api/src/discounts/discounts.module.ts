import { Module } from '@nestjs/common';
import { DiscountPolicyController } from './discount-policy.controller';
import { DiscountPolicyService } from './discount-policy.service';

// Exporta el servicio porque OrdersService lo consulta al validar cada venta.
@Module({
  controllers: [DiscountPolicyController],
  providers: [DiscountPolicyService],
  exports: [DiscountPolicyService],
})
export class DiscountsModule {}
