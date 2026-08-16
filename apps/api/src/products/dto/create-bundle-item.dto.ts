import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBundleItemDto {
  @IsString()
  @MinLength(1)
  componentProductId!: string;

  @IsOptional()
  @IsString()
  componentVariantId?: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;
}
