import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  TenantSubscription,
  SubscriptionEvent,
  SubscribeResponse,
  UpdateTenantSubscriptionInput,
} from "@pos/shared-types";
import { apiGet, apiPost, apiPatch } from "@/lib/api";

// Alimenta el banner que se ve en todo el sistema, así que se refresca solo
// cada tanto: si el comercio paga desde otra pestaña o se le acredita el
// débito automático, el aviso desaparece sin tener que recargar a mano.
export function useSubscription(enabled = true) {
  return useQuery({
    queryKey: ["subscription", "me"],
    queryFn: () => apiGet<TenantSubscription>("/billing/me"),
    enabled,
    refetchInterval: 5 * 60_000,
    // Un fallo acá (red caída) no debe romper la app: el banner simplemente
    // no se muestra.
    retry: false,
  });
}

export function useSubscriptionEvents(enabled = true) {
  return useQuery({
    queryKey: ["subscription", "events"],
    queryFn: () => apiGet<SubscriptionEvent[]>("/billing/events"),
    enabled,
  });
}

export function useSubscribe() {
  return useMutation({
    mutationFn: () => apiPost<SubscribeResponse>("/billing/subscribe", {}),
  });
}

// ── Panel de plataforma (SUPERADMIN) ────────────────────────────────────────

export function usePlatformTenants(enabled = true) {
  return useQuery({
    queryKey: ["platform", "tenants"],
    queryFn: () => apiGet<TenantSubscription[]>("/platform/tenants"),
    enabled,
  });
}

export function usePlatformTenantEvents(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["platform", "tenants", tenantId, "events"],
    queryFn: () => apiGet<SubscriptionEvent[]>(`/platform/tenants/${tenantId}/events`),
    enabled: Boolean(tenantId),
  });
}

export function useUpdatePlatformTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTenantSubscriptionInput }) =>
      apiPatch<TenantSubscription>(`/platform/tenants/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform"] });
      void queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });
}
