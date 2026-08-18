import type { PremiumFeature } from "@pos/shared-types";
import { useSubscription } from "./useSubscription";

// Deriva el estado de plan/demo de useSubscription() (GET /billing/me, ya
// consultado cada 5 min por SubscriptionBanner) — no agrega un request
// nuevo. La FRONTERA real vive en el backend (PlanFeatureInterceptor +
// assertFeature/assertQuota en los servicios); esto solo dibuja el candado.
//
// Falla ABIERTO a propósito: si /billing/me no respondió todavía o falló
// (red caída), `can()` devuelve true y `isDemo` es false — un error de red
// nunca debe trabar a un cliente pago. Un visitante demo real sí tiene
// datos (el fetch inicial ocurre apenas hay sesión), así que el candado
// aparece enseguida en el caso que importa.
export function usePlan() {
  const { data } = useSubscription();
  const plan = data?.plan;

  return {
    plan,
    isDemo: plan?.isDemo ?? false,
    demoExpiresAt: plan?.demoExpiresAt ?? null,
    demoDaysRemaining: plan?.demoDaysRemaining ?? null,
    can: (feature: PremiumFeature) => plan?.features[feature] ?? true,
    productsUsage: plan?.usage?.products ?? null,
    productsMax: plan?.limits.maxProducts ?? null,
    storesUsage: plan?.usage?.stores ?? null,
    storesMax: plan?.limits.maxStores ?? null,
  };
}
