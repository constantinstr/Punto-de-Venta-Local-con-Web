"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  EffectiveSubscriptionState,
  EnforcementPolicy,
  TenantSubscription,
} from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  usePlatformTenants,
  usePlatformTenantEvents,
  useUpdatePlatformTenant,
} from "@/hooks/useSubscription";
import { ApiError } from "@/lib/api";

const STATE_LABELS: Record<EffectiveSubscriptionState, string> = {
  TRIAL: "Prueba",
  ACTIVE: "Al día",
  GRACE: "En gracia",
  EXPIRED: "Vencido",
  CANCELLED: "De baja",
};

const STATE_STYLES: Record<EffectiveSubscriptionState, string> = {
  TRIAL: "text-amber-600",
  ACTIVE: "text-green-600",
  GRACE: "text-amber-600",
  EXPIRED: "text-red-600",
  CANCELLED: "text-red-600",
};

const POLICY_LABELS: Record<EnforcementPolicy, string> = {
  WARN_ONLY: "Solo avisa",
  READ_ONLY: "Solo lectura",
  BLOCK: "Bloquea",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR");
}

export default function PlatformPage() {
  const user = useRequireAuth();
  const isSuperadmin = user?.role === "SUPERADMIN";
  const { data: tenants, isLoading } = usePlatformTenants(isSuperadmin);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!user) return null;
  if (!isSuperadmin) {
    return (
      <div className="mx-auto max-w-2xl p-8 font-sans">
        <p className="text-muted">Esta sección es solo para el staff del sistema.</p>
      </div>
    );
  }

  const overdue = (tenants ?? []).filter((t) =>
    ["GRACE", "EXPIRED", "CANCELLED"].includes(t.snapshot.state),
  ).length;

  return (
    <div className="mx-auto max-w-5xl p-8 font-sans">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Comercios</h1>
        <Link href="/platform/support-messages" className="text-sm underline">
          Mensajes de soporte / venta →
        </Link>
      </div>
      <p className="mb-6 text-sm text-muted">
        {tenants?.length ?? 0} comercio(s) · {overdue} con la suscripción vencida
      </p>

      {isLoading && <p className="text-muted">Cargando…</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 pr-3">Comercio</th>
            <th className="py-2 pr-3">Contacto</th>
            <th className="py-2 pr-3">Estado</th>
            <th className="py-2 pr-3">Paga hasta</th>
            <th className="py-2 pr-3 text-right">Mensual</th>
            <th className="py-2 pr-3">Política</th>
            <th className="py-2 pr-3">MP</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {tenants?.map((t) => (
            <TenantRow
              key={t.tenantId}
              tenant={t}
              expanded={expandedId === t.tenantId}
              onToggle={() =>
                setExpandedId(expandedId === t.tenantId ? null : t.tenantId)
              }
            />
          ))}
          {tenants?.length === 0 && !isLoading && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-muted">
                Todavía no hay comercios dados de alta.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TenantRow({
  tenant,
  expanded,
  onToggle,
}: {
  tenant: TenantSubscription;
  expanded: boolean;
  onToggle: () => void;
}) {
  const updateTenant = useUpdatePlatformTenant();
  const { data: events } = usePlatformTenantEvents(expanded ? tenant.tenantId : undefined);

  const [amount, setAmount] = useState(tenant.monthlyAmount?.toString() ?? "");
  const [policy, setPolicy] = useState<EnforcementPolicy>(tenant.enforcementPolicy);
  const [periodEnd, setPeriodEnd] = useState(
    tenant.currentPeriodEnd ? tenant.currentPeriodEnd.slice(0, 10) : "",
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setError(null);
    setSaved(false);
    try {
      await updateTenant.mutateAsync({
        id: tenant.tenantId,
        input: {
          monthlyAmount: amount.trim() === "" ? undefined : Number(amount),
          enforcementPolicy: policy,
          // Se manda a fin del día para que "paga hasta el 31" incluya el 31.
          currentPeriodEnd: periodEnd ? `${periodEnd}T23:59:59.999Z` : undefined,
          notes: notes.trim() || undefined,
        },
      });
      setSaved(true);
      setNotes("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  // Extiende un mes desde el vencimiento actual (o desde hoy si ya pasó).
  function extendOneMonth() {
    const base =
      tenant.currentPeriodEnd && new Date(tenant.currentPeriodEnd) > new Date()
        ? new Date(tenant.currentPeriodEnd)
        : new Date();
    base.setMonth(base.getMonth() + 1);
    setPeriodEnd(base.toISOString().slice(0, 10));
  }

  return (
    <>
      <tr className="border-b border-border">
        <td className="py-2 pr-3">{tenant.tenantName}</td>
        <td className="py-2 pr-3 text-xs text-muted">{tenant.contactEmail ?? "—"}</td>
        <td className={`py-2 pr-3 ${STATE_STYLES[tenant.snapshot.state]}`}>
          {STATE_LABELS[tenant.snapshot.state]}
        </td>
        <td className="py-2 pr-3 text-xs">{formatDate(tenant.currentPeriodEnd)}</td>
        <td className="py-2 pr-3 text-right">
          {tenant.monthlyAmount ? `$${tenant.monthlyAmount.toLocaleString("es-AR")}` : "—"}
        </td>
        <td className="py-2 pr-3 text-xs">{POLICY_LABELS[tenant.enforcementPolicy]}</td>
        <td className="py-2 pr-3 text-xs">
          {tenant.hasMercadoPagoSubscription ? "Sí" : "No"}
        </td>
        <td className="py-2 text-right text-xs">
          <button onClick={onToggle} className="underline">
            {expanded ? "Cerrar" : "Gestionar"}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border bg-accent-muted/30">
          <td colSpan={8} className="p-4">
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="text-xs text-muted">
                Precio mensual
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-0.5 block w-32 rounded border border-border bg-surface px-2 py-1.5"
                />
              </label>
              <label className="text-xs text-muted">
                Paga hasta
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="mt-0.5 block rounded border border-border bg-surface px-2 py-1.5"
                />
              </label>
              <button
                type="button"
                onClick={extendOneMonth}
                className="rounded border border-border px-2 py-1.5 text-xs"
              >
                +1 mes
              </button>
              <label className="text-xs text-muted">
                Si vence
                <select
                  value={policy}
                  onChange={(e) => setPolicy(e.target.value as EnforcementPolicy)}
                  className="mt-0.5 block rounded border border-border bg-surface px-2 py-1.5"
                >
                  <option value="WARN_ONLY">Solo avisa</option>
                  <option value="READ_ONLY">Solo lectura</option>
                  <option value="BLOCK">Bloquea</option>
                </select>
              </label>
              <label className="flex-1 text-xs text-muted">
                Motivo (queda en el historial)
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: pagó por transferencia"
                  className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5"
                />
              </label>
              <button
                onClick={() => void handleSave()}
                disabled={updateTenant.isPending}
                className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {updateTenant.isPending ? "Guardando…" : "Guardar"}
              </button>
            </div>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            {saved && <p className="mt-2 text-sm text-green-600">Cambios aplicados.</p>}

            <div className="mt-4">
              <p className="mb-1 text-xs font-medium text-muted">Historial</p>
              <ul className="space-y-1 text-xs text-muted">
                {events?.map((e) => (
                  <li key={e.id}>
                    {new Date(e.createdAt).toLocaleString("es-AR")} · {e.type} · {e.status}
                    {e.amount ? ` · $${Number(e.amount).toLocaleString("es-AR")}` : ""}
                    {e.notes ? ` · ${e.notes}` : ""}
                  </li>
                ))}
                {events?.length === 0 && <li>Sin movimientos.</li>}
              </ul>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
