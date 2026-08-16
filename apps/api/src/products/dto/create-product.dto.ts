import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ProductType, VatCondition } from '@pos/database';
import { CreateVariantDto } from './create-variant.dto';
import { CreateBundleItemDto } from './create-bundle-item.dto';
import { StockEntryDto } from './stock-entry.dto';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ProductType)
  type!: ProductType;

  @IsNumber()
  @Min(0)
  costPrice!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsEnum(VatCondition)
  vatCondition!: VatCondition;

  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

  // Requerido y no vacío cuando type = VARIABLE.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];

  // Requerido y no vacío cuando type = BUNDLE.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBundleItemDto)
  bundleItems?: CreateBundleItemDto[];

  // Solo aplica a type = SIMPLE (para VARIABLE, el stock inicial va dentro de cada variante).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockEntryDto)
  initialStock?: StockEntryDto[];
}
