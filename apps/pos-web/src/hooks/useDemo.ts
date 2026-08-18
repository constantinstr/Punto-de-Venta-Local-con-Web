import { useMutation } from "@tanstack/react-query";
import type { DemoStartResponse } from "@pos/shared-types";
import { apiPost } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

// Provisiona un tenant demo (POST /demo/start, sin body, sin auth previa) y
// deja al visitante logueado — misma forma de respuesta que /auth/login, así
// que reusa setSession en vez de un flujo de sesión aparte.
export function useStartDemo() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: () => apiPost<DemoStartResponse>("/demo/start", {}),
    onSuccess: (data) => {
      setSession(data.user, data.tokens, data.credentials);
    },
  });
}
