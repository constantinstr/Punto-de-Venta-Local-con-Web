import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  TiendanubeCatalogSyncResult,
  TestConnectionResult,
  TiendanubeAuthorizeUrl,
  TiendanubeConfig,
  TiendanubeWebhookRegistration,
  UpdateTiendanubeConfigInput,
} from "@pos/shared-types";
import { apiGet, apiPatch, apiPost } from "@/lib/api";

const KEY = "tiendanube-config";

// A diferencia de WooCommerce, acá el backend devuelve `null` (no 404) cuando
// el local todavía no conectó su tienda: no hay formulario de alta que
// mostrar — el estado inicial normal es "todavía no autorizó".
export function useTiendanubeConfig(storeId: string | undefined) {
  return useQuery({
    queryKey: [KEY, storeId],
    queryFn: () =>
      apiGet<TiendanubeConfig | null>(`/tiendanube-config?storeId=${storeId}`),
    enabled: Boolean(storeId),
  });
}

export function useUpdateTiendanubeConfig(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTiendanubeConfigInput) =>
      apiPatch<TiendanubeConfig>(`/tiendanube-config/${id}`, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

// No redirige desde el hook: devuelve la URL para que la pantalla haga la
// navegación de nivel superior. Tienda Nube muestra su propia pantalla de
// permisos, así que tiene que salir de la app, no abrirse en un iframe.
export function useTiendanubeAuthorizeUrl() {
  return useMutation({
    mutationFn: (storeId: string) =>
      apiGet<TiendanubeAuthorizeUrl>(
        `/integrations/tiendanube/authorize-url?storeId=${storeId}`,
      ),
  });
}

export function useTestTiendanubeConnection() {
  return useMutation({
    mutationFn: (storeId: string) =>
      apiPost<TestConnectionResult>("/tiendanube-config/test-connection", {
        storeId,
      }),
  });
}

export function useSyncTiendanubeCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storeId: string) =>
      apiPost<TiendanubeCatalogSyncResult>("/tiendanube-config/sync-catalog", {
        storeId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
      void queryClient.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

// Los webhooks se dan de alta solos al conectar, pero eso es best-effort:
// si Tienda Nube estaba caída, o si cambió la URL pública del servidor, hay
// que poder volver a registrarlos sin desconectar la tienda.
export function useRegisterTiendanubeWebhooks() {
  return useMutation({
    mutationFn: (storeId: string) =>
      apiPost<TiendanubeWebhookRegistration>(
        "/tiendanube-config/register-webhooks",
        { storeId },
      ),
  });
}
