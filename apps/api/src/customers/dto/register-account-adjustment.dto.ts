import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class RegisterAccountAdjustmentDto {
  // Con signo: positivo aumenta la deuda, negativo la reduce (condonación,
  // corrección de un error de carga, etc.) — a diferencia de
  // RegisterAccountPaymentDto.amount, que siempre es positivo.
  @IsNumber()
  delta!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
