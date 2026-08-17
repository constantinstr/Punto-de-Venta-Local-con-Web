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

  // null = volver al valor por defecto de ese rol (borra la fila). NO es
  // "sin tope": para eso se manda 100. Y 0 es "no puede descontar nada".
  // ValidateIf deja pasar el null explícito sin que IsNumber lo rechace.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  maxPercent?: number | null;
}
