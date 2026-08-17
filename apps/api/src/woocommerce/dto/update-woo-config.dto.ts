import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class UpdateWooConfigDto {
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  apiUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  consumerKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  consumerSecret?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  webhookSecret?: string;

  @IsOptional()
  @IsBoolean()
  syncStockOutbound?: boolean;

  @IsOptional()
  @IsBoolean()
  syncStockInbound?: boolean;

  @IsOptional()
  @IsBoolean()
  syncPriceOutbound?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
