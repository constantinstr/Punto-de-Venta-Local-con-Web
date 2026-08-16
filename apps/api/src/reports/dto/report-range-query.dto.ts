import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ReportRangeQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsString()
  storeId?: string;
}
