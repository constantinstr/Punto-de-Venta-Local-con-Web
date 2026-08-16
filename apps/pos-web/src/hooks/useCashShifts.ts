import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CashRegister,
  CashShift,
  CashMovement,
  CashShiftSummary,
  OpenShiftInput,
  CreateMovementInput,
  CloseShiftInput,
} from "@pos/shared-types";
import { apiGet, apiPost } from "@/lib/api";

export function useCashRegisters(storeId: string | undefined) {
  return useQuery({
    queryKey: ["cash-registers", storeId],
    queryFn: () => apiGet<CashRegister[]>(`/cash-registers?storeId=${storeId}`),
    enabled: Boolean(storeId),
  });
}

export function useCreateCashRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { storeId: string; name: string }) => apiPost<CashRegister>("/cash-registers", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cash-registers"] }),
  });
}

export function useCurrentShift(cashRegisterId: string | undefined) {
  return useQuery({
    queryKey: ["cash-shifts", "current", cashRegisterId],
    queryFn: () => apiGet<CashShift | null>(`/cash-shifts/current?cashRegisterId=${cashRegisterId}`),
    enabled: Boolean(cashRegisterId),
    // El estado de la caja puede cambiar desde otra pestaña/terminal —
    // refrescar cada tanto para no operar con datos viejos.
    refetchInterval: 30_000,
  });
}

export function useOpenShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OpenShiftInput) => apiPost<CashShift>("/cash-shifts/open", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cash-shifts"] }),
  });
}

export function useShiftSummary(shiftId: string | undefined) {
  return useQuery({
    queryKey: ["cash-shifts", shiftId, "summary"],
    queryFn: () => apiGet<CashShiftSummary>(`/cash-shifts/${shiftId}/summary`),
    enabled: Boolean(shiftId),
  });
}

export function useShiftMovements(shiftId: string | undefined) {
  return useQuery({
    queryKey: ["cash-shifts", shiftId, "movements"],
    queryFn: () => apiGet<CashMovement[]>(`/cash-shifts/${shiftId}/movements`),
    enabled: Boolean(shiftId),
  });
}

export function useAddMovement(shiftId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMovementInput) => apiPost<CashMovement>(`/cash-shifts/${shiftId}/movements`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cash-shifts", shiftId] });
    },
  });
}

export function useCloseShift(shiftId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CloseShiftInput) => apiPost<CashShift>(`/cash-shifts/${shiftId}/close`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cash-shifts"] }),
  });
}
