import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class StockEntryDto {
  @IsString()
  @MinLength(1)
  storeId!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;
}
