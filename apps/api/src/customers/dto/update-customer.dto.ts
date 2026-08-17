import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CustomerDocType, CustomerTaxCondition } from '@pos/database';

export class UpdateCustomerDto {
  @IsOptional()
  @IsEnum(CustomerDocType)
  docType?: CustomerDocType;

  @IsOptional()
  @IsString()
  docNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsEnum(CustomerTaxCondition)
  taxCondition?: CustomerTaxCondition;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // null explícito = sin límite (borra el límite existente); undefined =
  // no tocar el campo.
  @IsOptional()
  @IsNumber()
  creditLimit?: number | null;
}
