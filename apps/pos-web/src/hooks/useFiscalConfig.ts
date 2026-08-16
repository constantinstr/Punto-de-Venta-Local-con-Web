import { useQuery } from "@tanstack/react-query";
import type { FiscalConfig } from "@pos/shared-types";
import { apiGet, ApiError } from "@/lib/api";

// El backend devuelve 404 cuando el local no tiene configuración fiscal
// cargada todavía — no es un error de la UI, es un estado válido (solo
// Ticket X disponible), así que se traduce a `null` en vez de romper.
export function useFiscalConfig(storeId: string | undefined) {
  return useQuery({
    queryKey: ["fiscal-config", storeId],
    queryFn: async (): Promise<FiscalConfig | null> => {
      try {
        return await apiGet<FiscalConfig>(`/fiscal-config?storeId=${storeId}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(storeId),
  });
}
