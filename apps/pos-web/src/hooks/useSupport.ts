import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateSupportMessageInput, SupportMessage, SupportMessageStatus } from "@pos/shared-types";
import { apiGet, apiPatch, apiPost } from "@/lib/api";

// Usado por SupportWidget (dudas técnicas) y PremiumContactForm (interés en
// Premium) — dos componentes distintos a propósito (ver el comentario en
// PremiumContactForm.tsx), pero el mismo endpoint y la misma mutación.
export function useCreateSupportMessage() {
  return useMutation({
    mutationFn: (input: CreateSupportMessageInput) =>
      apiPost<SupportMessage>("/support/messages", input),
  });
}

// ── Panel de plataforma (SUPERADMIN) ────────────────────────────────────────

export function usePlatformSupportMessages(status?: SupportMessageStatus) {
  return useQuery({
    queryKey: ["platform", "support-messages", status ?? "all"],
    queryFn: () =>
      apiGet<SupportMessage[]>(
        status ? `/platform/support-messages?status=${status}` : "/platform/support-messages",
      ),
  });
}

export function useResolveSupportMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPatch<SupportMessage>(`/platform/support-messages/${id}/resolve`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "support-messages"] });
    },
  });
}
