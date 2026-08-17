"use client";

import Link from "next/link";
import type { EffectiveSubscriptionState } from "@pos/shared-types";
import { useSubscription } from "@/hooks/useSubscription";

// Solo dos niveles de énfasis: "te falta poco" (ámbar) y "ya venció" (rojo).
// Un tercer color intermedio no aportaría información y le quita peso al que
// de verdad importa.
const URGENT_STATES: EffectiveSubscriptionState[] = ["GRACE", "EXPIRED", "CANCELLED"];

export function SubscriptionBanner() {
  const { data } = useSubscription();

  // Sin datos (todavía cargando, o la consulta falló) no se muestra nada: el
  // banner nunca debe ser el motivo por el que alguien no puede trabajar.
  if (!data?.snapshot.shouldWarn || !data.snapshot.message) return null;

  const urgent = URGENT_STATES.includes(data.snapshot.state);

  return (
    <div
      role="status"
      className={
        urgent
          ? "flex flex-wrap items-center justify-between gap-2 border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          : "flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
      }
    >
      <span>{data.snapshot.message}</span>
      <Link
        href="/settings/subscription"
        className="shrink-0 font-medium underline underline-offset-2"
      >
        {data.hasMercadoPagoSubscription ? "Ver suscripción" : "Suscribirme"}
      </Link>
    </div>
  );
}
