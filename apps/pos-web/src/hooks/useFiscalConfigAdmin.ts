import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  FiscalConfig,
  CreateFiscalConfigInput,
  UpdateFiscalConfigInput,
} from "@pos/shared-types";
import { apiPost, apiPatch } from "@/lib/api";

// Mutaciones de la configuración fiscal. La lectura vive en useFiscalConfig.ts
// (la usa el checkout para saber si puede facturar); acá está solo lo que
// necesita la pantalla de administración.
//
// La API NUNCA devuelve el certificado ni la clave privada, ni siquiera al
// crearlos: lo que vuelve son los metadatos (CUIT, punto de venta, entorno).

export function useCreateFiscalConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFiscalConfigInput) =>
      apiPost<FiscalConfig>("/fiscal-config", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fiscal-config"] });
    },
  });
}

export function useUpdateFiscalConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFiscalConfigInput }) =>
      apiPatch<FiscalConfig>(`/fiscal-config/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fiscal-config"] });
    },
  });
}
