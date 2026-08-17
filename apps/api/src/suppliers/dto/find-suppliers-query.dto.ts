import { IsOptional, IsString } from 'class-validator';

export class FindSuppliersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
