import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateQuoteInput, Quote } from "@pos/shared-types";
import { apiGet, apiPost } from "@/lib/api";

export interface QuotesFilters {
  storeId?: string;
  customerId?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedQuotes {
  data: Quote[];
  total: number;
  page: number;
  limit: number;
}

function buildQuotesQuery(filters: QuotesFilters): string {
  const entries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries as [string, string][]).toString();
}

export function useQuotesList(filters: QuotesFilters) {
  return useQuery({
    queryKey: ["quotes", "list", filters],
    queryFn: () => apiGet<PaginatedQuotes>(`/quotes${buildQuotesQuery(filters)}`),
  });
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: ["quotes", id],
    queryFn: () => apiGet<Quote>(`/quotes/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuoteInput) => apiPost<Quote>("/quotes", input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useCancelQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<Quote>(`/quotes/${id}/cancel`, {}),
    onSuccess: (quote) => {
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      void queryClient.invalidateQueries({ queryKey: ["quotes", quote.id] });
    },
  });
}
