import {
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '@pos/database';

export class SetDiscountPolicyDto {
  @IsEnum(UserRole)
  role!: UserRole;

  // null = sacar el tope (ese rol vuelve a poder descontar sin límite).
  // Es distinto de 0, que significa "no puede descontar nada".
  // ValidateIf deja pasar el null explícito sin que IsNumber lo rechace.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  maxPercent?: number | null;
}
