import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerAccount,
  RegisterAccountPaymentInput,
  RegisterAccountAdjustmentInput,
} from "@pos/shared-types";
import { apiGet, apiPost, apiPatch } from "@/lib/api";

export interface CustomersFilters {
  q?: string;
  withDebt?: boolean;
  includeInactive?: boolean;
}

function buildCustomersQuery(filters: CustomersFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.withDebt) params.set("withDebt", "true");
  if (filters.includeInactive) params.set("includeInactive", "true");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useCustomers(search: string) {
  return useQuery({
    queryKey: ["customers", search],
    queryFn: () => apiGet<Customer[]>(`/customers${buildCustomersQuery({ q: search })}`),
  });
}

export function useCustomersList(filters: CustomersFilters) {
  return useQuery({
    queryKey: ["customers", "list", filters],
    queryFn: () => apiGet<Customer[]>(`/customers${buildCustomersQuery(filters)}`),
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ["customers", id],
    queryFn: () => apiGet<Customer>(`/customers/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) => apiPost<Customer>("/customers", input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerInput }) =>
      apiPatch<Customer>(`/customers/${id}`, input),
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customers", customer.id] });
    },
  });
}

export function useCustomerAccount(id: string | undefined, page = 1) {
  return useQuery({
    queryKey: ["customers", id, "account", page],
    queryFn: () => apiGet<CustomerAccount>(`/customers/${id}/account?page=${page}`),
    enabled: Boolean(id),
  });
}

export function useRegisterAccountPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RegisterAccountPaymentInput }) =>
      apiPost(`/customers/${id}/account/payments`, input),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customers", id] });
      void queryClient.invalidateQueries({ queryKey: ["customers", id, "account"] });
      void queryClient.invalidateQueries({ queryKey: ["cash-shifts"] });
    },
  });
}

export function useRegisterAccountAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RegisterAccountAdjustmentInput }) =>
      apiPost(`/customers/${id}/account/adjustments`, input),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customers", id] });
      void queryClient.invalidateQueries({ queryKey: ["customers", id, "account"] });
    },
  });
}
