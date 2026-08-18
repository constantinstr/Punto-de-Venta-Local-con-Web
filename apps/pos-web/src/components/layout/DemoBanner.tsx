"use client";

import { useState } from "react";
import Link from "next/link";
import { usePlan } from "@/hooks/usePlan";
import { useAuthStore } from "@/lib/auth-store";

// Reemplaza a SubscriptionBanner mientras el tenant es demo (ver el corte
// en SubscriptionBanner.tsx) — mismo lugar en AppShell, mismo formato de
// franja, pero con su propio mensaje y su propio color (ámbar informativo,
// no de alerta: un demo por vencer no es un problema, es el estado esperado).
export function DemoBanner() {
  const { isDemo, demoDaysRemaining } = usePlan();
  const demoCredentials = useAuthStore((s) => s.demoCredentials);
  const [showCredentials, setShowCredentials] = useState(false);

  if (!isDemo) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
    >
      <span>
        Estás en una demo
        {demoDaysRemaining !== null && (
          <> — se borra en {demoDaysRemaining} día{demoDaysRemaining === 1 ? "" : "s"}</>
        )}
        . Los datos que cargues son de prueba y no se pueden migrar a un comercio real.
      </span>

      <span className="flex shrink-0 items-center gap-3">
        {demoCredentials && (
          <button
            type="button"
            onClick={() => setShowCredentials((v) => !v)}
            className="font-medium underline underline-offset-2"
          >
            {showCredentials ? "Ocultar mis datos" : "Ver mis datos de acceso"}
          </button>
        )}
        <Link href="/register" className="font-medium underline underline-offset-2">
          Registrar mi comercio
        </Link>
      </span>

      {showCredentials && demoCredentials && (
        <div className="w-full text-xs text-amber-800 dark:text-amber-400">
          Email: <code>{demoCredentials.email}</code> · Contraseña: <code>{demoCredentials.password}</code>
        </div>
      )}
    </div>
  );
}
