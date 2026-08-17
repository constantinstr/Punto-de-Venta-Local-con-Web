import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@pos/database';

export class RegisterAccountPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  // Requerido cuando method=CASH — ver CustomersService.registerPayment: un
  // cobro en efectivo tiene que entrar al cajón de un turno abierto, si no
  // el arqueo de esa caja queda con un sobrante fantasma.
  @IsOptional()
  @IsString()
  cashShiftId?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Generado por el cliente (UUID) para que un doble clic / reintento de
  // red no cobre dos veces — ver @@unique([tenantId, idempotencyKey]).
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
