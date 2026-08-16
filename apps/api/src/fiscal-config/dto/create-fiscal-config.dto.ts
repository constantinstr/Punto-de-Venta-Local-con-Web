import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { FiscalTaxCondition } from '@pos/database';

export class CreateFiscalConfigDto {
  @IsString()
  @MinLength(1)
  storeId!: string;

  @IsString()
  @MinLength(11)
  cuit!: string;

  @IsEnum(FiscalTaxCondition)
  taxCondition!: FiscalTaxCondition;

  @IsOptional()
  @IsString()
  grossIncomeNumber?: string;

  @IsOptional()
  @IsDateString()
  activityStartDate?: string;

  @IsInt()
  @Min(1)
  ptoVta!: number;

  @IsString()
  @MinLength(1)
  crtCertificate!: string;

  @IsString()
  @MinLength(1)
  keyCertificate!: string;

  @IsOptional()
  @IsBoolean()
  isProduction?: boolean;
}
