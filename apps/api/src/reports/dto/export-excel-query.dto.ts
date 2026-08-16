import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export enum ExportType {
  SALES = 'sales',
  PRODUCTS = 'products',
  SHIFTS = 'shifts',
}

export class ExportExcelQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsString()
  storeId?: string;

  @IsEnum(ExportType)
  type!: ExportType;
}
