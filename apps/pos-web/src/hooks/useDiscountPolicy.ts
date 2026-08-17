import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DiscountPolicy,
  SetDiscountPolicyInput,
  UserRole,
} from "@pos/shared-types";
import { apiGet, apiPut } from "@/lib/api";

const KEY = "discount-policies";

// El backend devuelve SOLO los roles con tope. Un rol ausente no tiene
// límite: la pantalla completa el resto con "Sin tope".
export function useDiscountPolicies() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => apiGet<DiscountPolicy[]>("/discount-policies"),
  });
}

export function useSetDiscountPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetDiscountPolicyInput) =>
      apiPut<DiscountPolicy | null>("/discount-policies", input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

// Tope del usuario que está vendiendo, listo para el POS. Devuelve null
// mientras carga y también cuando ese rol no tiene tope — en los dos casos la
// pantalla no debe bloquear nada: el backend es el que valida de verdad, así
// que un tope que todavía no llegó solo significa que el aviso aparece un
// instante después, no que se pueda saltear el control.
export function useMyDiscountLimit(role: UserRole | undefined): number | null {
  const { data } = useDiscountPolicies();
  if (!role || !data) return null;
  const mine = data.find((p) => p.role === role);
  return mine ? Number(mine.maxPercent) : null;
}
