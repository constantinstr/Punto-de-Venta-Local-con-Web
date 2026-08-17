"use client";

import { useState } from "react";
import Link from "next/link";
import type { EffectiveSubscriptionState } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscription, useSubscriptionEvents, useSubscribe } from "@/hooks/useSubscription";
import { ApiError } from "@/lib/api";

const STATE_LABELS: Record<EffectiveSubscriptionState, string> = {
  TRIAL: "Período de prueba",
  ACTIVE: "Al día",
  GRACE: "Vencida (en período de gracia)",
  EXPIRED: "Vencida",
  CANCELLED: "Dada de baja",
};

const STATE_STYLES: Record<EffectiveSubscriptionState, string> = {
  TRIAL: "text-amber-600",
  ACTIVE: "text-green-600",
  GRACE: "text-amber-600",
  EXPIRED: "text-red-600",
  CANCELLED: "text-red-600",
};

const EVENT_LABELS: Record<string, string> = {
  "mp.payment": "Pago",
  "mp.subscription_preapproval": "Cambio de suscripción",
  "manual.update": "Ajuste manual",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR");
}

export default function SubscriptionPage() {
  const user = useRequireAuth();
  const { data: subscription, isLoading } = useSubscription(Boolean(user));
  const canSeeHistory = user?.role === "OWNER" || user?.role === "ADMIN";
  const { data: events } = useSubscriptionEvents(canSeeHistory);
  const subscribe = useSubscribe();
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  if (isLoading || !subscription) return <p className="p-8 text-muted">Cargando…</p>;

  const { snapshot } = subscription;
  const isOwner = user.role === "OWNER";

  async function handleSubscribe() {
    setError(null);
    try {
      const result = await subscribe.mutateAsync();
      if (!result.initPoint) {
        setError("Mercado Pago no devolvió un link de pago. Intentá de nuevo en unos minutos.");
        return;
      }
      // Se va a Mercado Pago a adherir la tarjeta. Los datos de tarjeta nunca
      // pasan por este sistema.
      window.location.href = result.initPoint;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar la suscripción");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8 font-sans">
      <div>
        <Link href="/settings" className="text-sm text-muted underline">
          ← Configuración
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Suscripción</h1>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted">Estado</p>
            <p className={`text-2xl font-bold ${STATE_STYLES[snapshot.state]}`}>
              {STATE_LABELS[snapshot.state]}
            </p>
            {snapshot.message && <p className="mt-1 text-muted">{snapshot.message}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Precio mensual</p>
            <p className="text-lg font-medium">
              {subscription.monthlyAmount
                ? `$${subscription.monthlyAmount.toLocaleString("es-AR")}`
                : "A convenir"}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted">Fin del período de prueba</p>
            <p>{formatDate(subscription.trialEndsAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Paga hasta</p>
            <p>{formatDate(subscription.currentPeriodEnd)}</p>
          </div>
        </div>
      </section>

      {isOwner && (
        <section className="rounded-lg border border-border bg-surface p-4 text-sm">
          <h2 className="mb-2 font-medium text-foreground">
            {subscription.hasMercadoPagoSubscription ? "Débito automático" : "Activar débito automático"}
          </h2>
          {subscription.hasMercadoPagoSubscription ? (
            <p className="text-muted">
              Ya tenés el débito automático adherido en Mercado Pago. Podés gestionarlo o darlo de
              baja desde tu cuenta de Mercado Pago, en la sección de suscripciones.
            </p>
          ) : (
            <p className="text-muted">
              Al adherir, Mercado Pago te va a debitar la mensualidad automáticamente. Los datos de
              tu tarjeta se cargan en Mercado Pago — este sistema nunca los ve ni los guarda.
            </p>
          )}

          {error && <p className="mt-2 text-red-600">{error}</p>}

          <button
            onClick={() => void handleSubscribe()}
            disabled={subscribe.isPending}
            className="mt-3 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {subscribe.isPending
              ? "Redirigiendo…"
              : subscription.hasMercadoPagoSubscription
                ? "Volver a adherir"
                : "Adherir con Mercado Pago"}
          </button>
        </section>
      )}
      {!isOwner && (
        <p className="text-sm text-muted">
          Solo el dueño del comercio puede gestionar la suscripción.
        </p>
      )}

      {canSeeHistory && (
        <section className="rounded-lg border border-border bg-surface p-4 text-sm">
          <h2 className="mb-2 font-medium text-foreground">Historial</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Concepto</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3 text-right">Monto</th>
                <th className="py-2 pr-3">Paga hasta</th>
              </tr>
            </thead>
            <tbody>
              {events?.map((e) => (
                <tr key={e.id} className="border-b border-border">
                  <td className="py-2 pr-3 text-xs text-muted">
                    {new Date(e.createdAt).toLocaleString("es-AR")}
                  </td>
                  <td className="py-2 pr-3">{EVENT_LABELS[e.type] ?? e.type}</td>
                  <td className="py-2 pr-3 text-xs">{e.status}</td>
                  <td className="py-2 pr-3 text-right">
                    {e.amount ? `$${Number(e.amount).toLocaleString("es-AR")}` : "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted">{formatDate(e.periodEnd)}</td>
                </tr>
              ))}
              {events?.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    Todavía no hay movimientos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
