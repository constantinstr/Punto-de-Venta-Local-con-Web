import { SetMetadata } from '@nestjs/common';
import type { PremiumFeature } from './plan.service';

export const PREMIUM_FEATURE_KEY = 'premiumFeature';

// Marca un controller o handler como parte del plan pago. Leído por
// PlanFeatureInterceptor. Un tenant demo recibe 403 al pegarle; un tenant
// standard pasa de largo. No es un guard por la misma razón que
// SubscriptionEnforcementInterceptor tampoco lo es — ver su comentario.
export const Premium = (feature: PremiumFeature) =>
  SetMetadata(PREMIUM_FEATURE_KEY, feature);
