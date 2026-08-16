import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmptyObject,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { StockEntryDto } from './stock-entry.dto';

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  // Ej: { "talle": "L", "color": "Negro" }
  @IsObject()
  @IsNotEmptyObject()
  attributes!: Record<string, string>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockEntryDto)
  initialStock?: StockEntryDto[];
}
