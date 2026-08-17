import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Purchase, CreatePurchaseInput, PaginatedPurchases } from "@pos/shared-types";
import { apiGet, apiPost } from "@/lib/api";

export interface PurchasesFilters {
  storeId?: string;
  supplierId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

function buildQuery(filters: PurchasesFilters): string {
  const entries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries as [string, string][]).toString();
}

export function usePurchasesList(filters: PurchasesFilters) {
  return useQuery({
    queryKey: ["purchases", "list", filters],
    queryFn: () => apiGet<PaginatedPurchases>(`/purchases${buildQuery(filters)}`),
  });
}

export function usePurchase(id: string | undefined) {
  return useQuery({
    queryKey: ["purchases", id],
    queryFn: () => apiGet<Purchase>(`/purchases/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreatePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseInput) => apiPost<Purchase>("/purchases", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
