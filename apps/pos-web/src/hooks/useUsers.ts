import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StaffUser, CreateUserInput, UpdateUserInput } from "@pos/shared-types";
import { apiGet, apiPost, apiPatch } from "@/lib/api";

export function useUsersList() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<StaffUser[]>("/users"),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => apiPost<StaffUser>("/users", input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      apiPatch<StaffUser>(`/users/${id}`, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
