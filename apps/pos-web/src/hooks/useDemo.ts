import { useMutation } from "@tanstack/react-query";
import type { DemoStartResponse } from "@pos/shared-types";
import { apiPost } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

// Alta en DOS pasos (pedir código al mail + verificarlo) — exige un email
// real antes de crear nada, para frenar el spam de cuentas. Ninguno de los
// dos pasos toca la sesión hasta que verifyCode confirma.
export function useRequestDemoCode() {
  return useMutation({
    mutationFn: (email: string) => apiPost<{ ok: true }>("/demo/request-code", { email }),
  });
}

export function useVerifyDemoCode() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: (input: { email: string; code: string }) =>
      apiPost<DemoStartResponse>("/demo/verify-code", input),
    // Misma forma que /auth/login — el frontend entra derecho, sin pedir
    // credenciales (ya no existen: volver a entrar es pedir un código nuevo).
    onSuccess: (data) => {
      setSession(data.user, data.tokens);
    },
  });
}
