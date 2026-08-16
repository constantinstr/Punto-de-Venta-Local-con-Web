import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CatalogSyncSummary,
  CreateWooConfigInput,
  SyncLog,
  TestConnectionResult,
  UpdateWooConfigInput,
  WooCommerceConfig,
} from "@pos/shared-types";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";

// El backend devuelve 404 cuando el local no tiene integración de
// WooCommerce cargada todavía — no es un error de la UI, es un estado
// válido (mostrar el formulario de alta), así que se traduce a `null`.
export function useWooCommerceConfig(storeId: string | undefined) {
  return useQuery({
    queryKey: ["woocommerce-config", storeId],
    queryFn: async (): Promise<WooCommerceConfig | null> => {
      try {
        return await apiGet<WooCommerceConfig>(`/woocommerce-config?storeId=${storeId}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(storeId),
  });
}

export function useCreateWooConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWooConfigInput) => apiPost<WooCommerceConfig>("/woocommerce-config", input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["woocommerce-config"] }),
  });
}

export function useUpdateWooConfig(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWooConfigInput) => apiPatch<WooCommerceConfig>(`/woocommerce-config/${id}`, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["woocommerce-config"] }),
  });
}

export function useTestWooConnection() {
  return useMutation({
    mutationFn: (storeId: string) => apiPost<TestConnectionResult>("/integrations/woocommerce/test-connection", { storeId }),
  });
}

export function useSyncWooCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storeId: string) => apiPost<CatalogSyncSummary>("/integrations/woocommerce/sync-catalog", { storeId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
      void queryClient.invalidateQueries({ queryKey: ["woocommerce-config"] });
    },
  });
}

export function useSyncLogs() {
  return useQuery({
    queryKey: ["sync-logs"],
    queryFn: () => apiGet<SyncLog[]>("/integrations/woocommerce/sync-logs"),
    refetchInterval: 5000, // los jobs de BullMQ terminan async, no hay push — se refresca solo
  });
}

export function useRetrySyncLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/integrations/woocommerce/sync-logs/${id}/retry`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["sync-logs"] }),
  });
}
