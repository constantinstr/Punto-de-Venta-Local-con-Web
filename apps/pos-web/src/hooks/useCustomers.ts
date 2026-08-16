import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Customer, CreateCustomerInput } from "@pos/shared-types";
import { apiGet, apiPost } from "@/lib/api";

export function useCustomers(search: string) {
  return useQuery({
    queryKey: ["customers", search],
    queryFn: () => apiGet<Customer[]>(`/customers${search ? `?q=${encodeURIComponent(search)}` : ""}`),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) => apiPost<Customer>("/customers", input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}
