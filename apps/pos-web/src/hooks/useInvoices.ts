import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateInvoiceInput, Invoice } from "@pos/shared-types";
import { apiGet, apiPost } from "@/lib/api";

export function useIssueInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => apiPost<Invoice>("/invoices", input),
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", invoice.orderId] });
    },
  });
}

export function useInvoiceByOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ["invoice", orderId],
    queryFn: () => apiGet<Invoice>(`/invoices/by-order/${orderId}`),
    enabled: Boolean(orderId),
    retry: false,
  });
}
