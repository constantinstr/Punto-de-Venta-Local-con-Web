import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum BulkPriceMode {
  PERCENT = 'PERCENT',
  FIXED_DELTA = 'FIXED_DELTA',
}

export class BulkPriceUpdateDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsEnum(BulkPriceMode)
  mode!: BulkPriceMode;

  // PERCENT: variación en % sobre el precio actual (10 = +10%, -5 = -5%).
  // FIXED_DELTA: monto absoluto sumado al precio actual (puede ser negativo).
  @IsNumber()
  value!: number;
}
