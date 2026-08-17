import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from './create-order-item.dto';
import { CreatePaymentDto } from './create-payment.dto';

export class CreateOrderDto {
  @IsString()
  @MinLength(1)
  storeId!: string;

  // Requerido en la práctica para ventas de mostrador (se valida en el
  // servicio, no acá, para poder dar un mensaje de error más claro). Queda
  // opcional a nivel de tipo porque el schema lo permite null pensando en
  // futuras órdenes online (Sprint 7) sin caja asociada.
  @IsOptional()
  @IsString()
  cashShiftId?: string;

  // Requerido en la práctica cuando algún payment es CURRENT_ACCOUNT (se
  // valida en el servicio) — ver OrdersService.attemptCreate.
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentDto)
  payments!: CreatePaymentDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
