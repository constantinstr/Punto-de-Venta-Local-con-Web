import { IsString, MinLength } from 'class-validator';

export class PosSearchQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;

  @IsString()
  @MinLength(1)
  storeId!: string;
}
