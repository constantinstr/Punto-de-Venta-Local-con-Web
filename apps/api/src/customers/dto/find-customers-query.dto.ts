import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class FindCustomersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  // Query string siempre llega como texto — @IsBooleanString acepta
  // "true"/"false" tal cual viajan en la URL (?withDebt=true).
  @IsOptional()
  @IsBooleanString()
  withDebt?: string;
}
