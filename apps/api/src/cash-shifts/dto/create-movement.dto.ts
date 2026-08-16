import { IsEnum, IsNumber, IsString, Min, MinLength } from 'class-validator';
import { CashMovementType } from '@pos/database';

export class CreateMovementDto {
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}
