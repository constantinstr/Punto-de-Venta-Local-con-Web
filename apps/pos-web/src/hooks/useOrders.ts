import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateOrderInput, Order } from "@pos/shared-types";
import { apiPost } from "@/lib/api";

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => apiPost<Order>("/orders", input),
    onSuccess: () => {
      // El stock disponible cambió — refrescar catálogo, stock y el resumen
      // de caja (la venta en efectivo mueve expectedCash) de inmediato.
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["cash-shifts"] });
    },
  });
}
