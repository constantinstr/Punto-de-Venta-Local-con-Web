"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStartDemo } from "@/hooks/useDemo";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api";

// Único fragmento cliente de la landing: aísla useMutation/useAuthStore para
// que el resto de la página (pitch, features, precios) pueda ser estático
// sin arrastrar todo a "use client" — ver el comentario del plan sobre esto.
export function DemoCta() {
  const router = useRouter();
  const startDemo = useStartDemo();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const [error, setError] = useState<string | null>(null);

  // Espera a la rehidratación antes de decidir qué botón mostrar — mismo
  // motivo que useRequireAuth, pero al revés: acá el default (mostrar
  // "Probar demo") es correcto para el 99% de los visitantes anónimos, así
  // que no hay pantalla en blanco mientras se espera: se muestra la CTA de
  // siempre y, si resulta que había sesión, se reemplaza un instante después.
  const alreadyLoggedIn = hasHydrated && Boolean(user);

  async function handleStartDemo() {
    setError(null);
    try {
      await startDemo.mutateAsync();
      router.push("/inicio");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Demasiados intentos. Probá de nuevo en un rato.");
      } else if (err instanceof ApiError && err.status === 503) {
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "No se pudo iniciar la demo.");
      }
    }
  }

  if (alreadyLoggedIn) {
    return (
      <Link
        href="/inicio"
        className="rounded bg-accent px-8 py-4 text-lg font-medium text-accent-foreground"
      >
        Ir a mi panel
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => void handleStartDemo()}
        disabled={startDemo.isPending}
        className="rounded bg-accent px-8 py-4 text-lg font-medium text-accent-foreground disabled:opacity-50"
      >
        {startDemo.isPending ? "Preparando tu demo…" : "Probar demo gratis"}
      </button>
      <p className="text-xs text-muted">
        Sin tarjeta, sin registro. Se borra sola a los 7 días.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
