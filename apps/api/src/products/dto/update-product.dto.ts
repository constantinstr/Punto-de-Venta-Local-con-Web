import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { VatCondition } from '@pos/database';

// El type (SIMPLE/VARIABLE/BUNDLE) no se puede cambiar después de creado —
// implicaría migrar variantes/combos/stock. Se crea un producto nuevo si
// hace falta cambiar de tipo.
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(VatCondition)
  vatCondition?: VatCondition;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
