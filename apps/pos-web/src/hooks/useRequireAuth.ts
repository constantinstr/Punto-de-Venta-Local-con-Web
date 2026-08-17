"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

export function useRequireAuth() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  useEffect(() => {
    // No redirigir hasta que zustand termine de leer localStorage — si no,
    // un usuario logueado se ve expulsado al login en cada refresh (el
    // primer render del cliente siempre arranca con user=null, antes de
    // que persist rehidrate).
    if (hasHydrated && !user) router.replace("/login");
  }, [hasHydrated, user, router]);

  return hasHydrated ? user : undefined;
}
