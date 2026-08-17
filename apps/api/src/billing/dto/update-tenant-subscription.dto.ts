import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { EnforcementPolicy, SubscriptionStatus } from '@pos/database';

// Solo lo usa el panel de plataforma (SUPERADMIN). Deliberadamente NO expone
// mpPreapprovalId: ese vínculo lo maneja únicamente el flujo de Mercado Pago,
// tocarlo a mano dejaría la suscripción apuntando a otra cosa.
export class UpdateTenantSubscriptionDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAmount?: number;

  @IsOptional()
  @IsEnum(EnforcementPolicy)
  enforcementPolicy?: EnforcementPolicy;

  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
