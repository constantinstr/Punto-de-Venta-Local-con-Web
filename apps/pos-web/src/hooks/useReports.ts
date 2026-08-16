import { useQuery } from "@tanstack/react-query";
import type {
  CashShiftsHistoryReport,
  PaymentMethodsReport,
  ReportRangeInput,
  SalesSummaryReport,
  TopProductsReport,
} from "@pos/shared-types";
import { apiGet } from "@/lib/api";

function rangeQuery(range: ReportRangeInput, extra?: Record<string, string | number>): string {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (range.storeId) params.set("storeId", range.storeId);
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  return params.toString();
}

export function useSalesSummary(range: ReportRangeInput, enabled = true) {
  return useQuery({
    queryKey: ["reports", "sales-summary", range],
    queryFn: () => apiGet<SalesSummaryReport>(`/reports/sales-summary?${rangeQuery(range)}`),
    enabled,
  });
}

export function usePaymentMethods(range: ReportRangeInput, enabled = true) {
  return useQuery({
    queryKey: ["reports", "payment-methods", range],
    queryFn: () => apiGet<PaymentMethodsReport>(`/reports/payment-methods?${rangeQuery(range)}`),
    enabled,
  });
}

export function useTopProducts(range: ReportRangeInput, limit = 10, enabled = true) {
  return useQuery({
    queryKey: ["reports", "top-products", range, limit],
    queryFn: () => apiGet<TopProductsReport>(`/reports/top-products?${rangeQuery(range, { limit })}`),
    enabled,
  });
}

export function useCashShiftsHistory(range: ReportRangeInput, enabled = true) {
  return useQuery({
    queryKey: ["reports", "cash-shifts-history", range],
    queryFn: () => apiGet<CashShiftsHistoryReport>(`/reports/cash-shifts-history?${rangeQuery(range)}`),
    enabled,
  });
}
