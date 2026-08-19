"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePlan } from "@/hooks/usePlan";
import { PremiumBadge } from "./PremiumBadge";
import { PremiumContactForm } from "./PremiumContactForm";

// Único camino que la demo bloqueada tiene que poder recorrer de punta a
// punta: ver que ya le asignaron precio y suscribirse — /billing/* ya está
// en ALWAYS_ALLOWED_PREFIXES del lado del servidor, así que esta pantalla
// tiene que dejarlo pasar en vez de taparla también.
const ALWAYS_ALLOWED_PATH = "/settings/subscription";

// Reemplaza el contenido normal cuando la demo ya está bloqueada
// (isDemoExpired) — sin esto, cada pantalla se estrellaría por separado
// contra el 403 que ya tira SubscriptionEnforcementInterceptor en el
// servidor (la frontera real; esto es solo la experiencia). Se monta en dos
// lugares porque no hay un solo layout que cubra ambos: AppShell (para
// (admin)/*) y src/app/pos/page.tsx (que vive fuera de AppShell a propósito,
// por peso de bundle).
export function DemoExpiredGate({ children }: { children: React.ReactNode }) {
  const { isDemoExpired, monthlyAmount } = usePlan();
  const pathname = usePathname();
  const [showContact, setShowContact] = useState(false);

  if (!isDemoExpired || pathname.startsWith(ALWAYS_ALLOWED_PATH)) {
    return <>{children}</>;
  }

  return (
    <div className="flex justify-center bg-background p-8">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <PremiumBadge />
          <h1 className="text-xl font-semibold text-foreground">Tu demo venció</h1>
        </div>
        <p className="text-sm text-muted">
          Tranquilo: tus datos siguen guardados. Pasá a Premium para seguir
          usando el sistema con el mismo comercio, sin perder nada de lo que
          cargaste.
        </p>

        {monthlyAmount ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              Ya tenés un precio asignado — completá la suscripción para desbloquear.
            </p>
            <Link
              href="/settings/subscription"
              className="block w-full rounded bg-accent py-2 text-sm font-medium text-accent-foreground"
            >
              Ir a Suscripción
            </Link>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowContact(true)}
            className="w-full rounded bg-accent py-2 text-sm font-medium text-accent-foreground"
          >
            Quiero pasar a Premium
          </button>
        )}
      </div>

      {showContact && (
        <PremiumContactForm
          context="Mi demo venció y quiero pasar a Premium."
          onClose={() => setShowContact(false)}
        />
      )}
    </div>
  );
}
