"use client";

import { useState } from "react";
import { usePlan } from "@/hooks/usePlan";
import { useAuthStore } from "@/lib/auth-store";
import { PremiumContactForm } from "@/components/common/PremiumContactForm";

// Reemplaza a SubscriptionBanner mientras el tenant es demo (ver el corte
// en SubscriptionBanner.tsx) — mismo lugar en AppShell, mismo formato de
// franja, pero con su propio mensaje y su propio color (ámbar informativo,
// no de alerta: un demo por vencer no es un problema, es el estado esperado).
export function DemoBanner() {
  const { isDemo, isDemoExpired, demoDaysRemaining } = usePlan();
  const demoCredentials = useAuthStore((s) => s.demoCredentials);
  const [showCredentials, setShowCredentials] = useState(false);
  const [showContact, setShowContact] = useState(false);

  // Una vez vencida, DemoExpiredGate ya reemplaza toda la pantalla con una
  // explicación completa — este banner arriba quedaría diciendo "se bloquea
  // en 0 días" sobre algo que ya está bloqueado, redundante y confuso.
  if (!isDemo || isDemoExpired) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
    >
      <span>
        Estás en una demo
        {demoDaysRemaining !== null && (
          <> — se bloquea en {demoDaysRemaining} día{demoDaysRemaining === 1 ? "" : "s"}</>
        )}
        . Tus datos quedan guardados: si pasás a Premium seguís con el mismo comercio.
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
        <button
          type="button"
          onClick={() => setShowContact(true)}
          className="font-medium underline underline-offset-2"
        >
          Quiero pasar a Premium
        </button>
      </span>

      {showCredentials && demoCredentials && (
        <div className="w-full text-xs text-amber-800 dark:text-amber-400">
          Email: <code>{demoCredentials.email}</code> · Contraseña: <code>{demoCredentials.password}</code>
        </div>
      )}

      {showContact && (
        <PremiumContactForm
          context="Quiero pasar a Premium desde el aviso de la demo."
          onClose={() => setShowContact(false)}
        />
      )}
    </div>
  );
}
