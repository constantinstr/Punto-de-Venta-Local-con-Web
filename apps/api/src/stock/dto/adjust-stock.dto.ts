import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

// Exactamente uno de productId/variantId debe venir seteado, y exactamente
// uno de delta/absoluteQuantity (validado en StockService, no acá, porque
// class-validator no maneja bien XOR entre dos pares de campos opcionales).
export class AdjustStockDto {
  @IsString()
  @MinLength(1)
  storeId!: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsNumber()
  delta?: number;

  @IsOptional()
  @IsNumber()
  absoluteQuantity?: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}
