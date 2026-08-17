import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NO_DISCOUNT_LIMIT } from "@pos/shared-types";
import type {
  DiscountPolicy,
  SetDiscountPolicyInput,
  UserRole,
} from "@pos/shared-types";
import { apiGet, apiPut } from "@/lib/api";

const KEY = "discount-policies";

// El backend devuelve los cuatro roles que venden, cada uno con su tope
// efectivo y si viene del valor por defecto o de una decisión del comercio.
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

// Tope del usuario que está vendiendo, listo para el POS.
//
// Devuelve null mientras la consulta no llegó, y también para un rol sin
// límite práctico (100%): en los dos casos la pantalla no muestra aviso ni
// bloquea nada. Que un tope todavía no haya cargado no abre ningún agujero —
// el control real está en el backend, así que lo único que pasa es que el
// aviso aparece un instante después.
export function useMyDiscountLimit(role: UserRole | undefined): number | null {
  const { data } = useDiscountPolicies();
  if (!role || !data) return null;
  const mine = data.find((p) => p.role === role);
  if (!mine || mine.maxPercent >= NO_DISCOUNT_LIMIT) return null;
  return mine.maxPercent;
}
