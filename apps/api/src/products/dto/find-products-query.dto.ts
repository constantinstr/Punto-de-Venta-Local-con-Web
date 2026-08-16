import { IsBooleanString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ProductType } from '@pos/database';

export class FindProductsQueryDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @IsOptional()
  @IsString()
  q?: string;

  // Si se pasa junto con storeId, filtra a productos con stock <= su
  // minAlertStock en ese local (ver ProductsService.findLowStock).
  @IsOptional()
  @IsBooleanString()
  lowStock?: string;

  @IsOptional()
  @IsString()
  storeId?: string;
}
