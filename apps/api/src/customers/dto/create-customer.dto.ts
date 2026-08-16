import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CustomerDocType, CustomerTaxCondition } from '@pos/database';

export class CreateCustomerDto {
  @IsOptional()
  @IsEnum(CustomerDocType)
  docType?: CustomerDocType;

  @IsOptional()
  @IsString()
  docNumber?: string;

  @IsString()
  @MinLength(1)
  name!: string;

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
}
