import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class CreateWooConfigDto {
  @IsString()
  @MinLength(1)
  storeId!: string;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  apiUrl!: string;

  @IsString()
  @MinLength(1)
  consumerKey!: string;

  @IsString()
  @MinLength(1)
  consumerSecret!: string;

  @IsString()
  @MinLength(8)
  webhookSecret!: string;

  @IsOptional()
  @IsBoolean()
  syncStockOutbound?: boolean;

  @IsOptional()
  @IsBoolean()
  syncStockInbound?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
