import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateOrderInput, Order } from "@pos/shared-types";
import { apiGet, apiPost } from "@/lib/api";

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

export interface OrdersFilters {
  storeId?: string;
  userId?: string;
  customerId?: string;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedOrders {
  data: Order[];
  total: number;
  page: number;
  limit: number;
}

function buildOrdersQuery(filters: OrdersFilters): string {
  const entries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries as [string, string][]).toString();
}

export function useOrdersList(filters: OrdersFilters) {
  return useQuery({
    queryKey: ["orders", "list", filters],
    queryFn: () => apiGet<PaginatedOrders>(`/orders${buildOrdersQuery(filters)}`),
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["orders", id],
    queryFn: () => apiGet<Order>(`/orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiPost<Order>(`/orders/${id}/cancel`, { reason }),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["orders", order.id] });
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["cash-shifts"] });
    },
  });
}
