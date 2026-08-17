import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from "@pos/shared-types";
import { apiGet, apiPost, apiPatch } from "@/lib/api";

export function useSuppliers(q = "") {
  return useQuery({
    queryKey: ["suppliers", q],
    queryFn: () => apiGet<Supplier[]>(`/suppliers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
}

export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: ["suppliers", id],
    queryFn: () => apiGet<Supplier>(`/suppliers/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierInput) => apiPost<Supplier>("/suppliers", input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSupplierInput }) =>
      apiPatch<Supplier>(`/suppliers/${id}`, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}
