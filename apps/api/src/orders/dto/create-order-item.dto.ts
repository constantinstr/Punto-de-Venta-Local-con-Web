import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

// unitPrice/taxRate/nombre/etc. NUNCA se reciben del cliente: se leen del
// catálogo server-side dentro de la transacción, para que no se puedan
// falsificar precios manipulando el request. Solo se confía en qué se
// vendió, cuánto y el descuento que autorizó el cajero en el momento.
export class CreateOrderItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}
