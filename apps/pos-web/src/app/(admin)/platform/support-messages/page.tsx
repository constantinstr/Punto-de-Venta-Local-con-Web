"use client";

import { useState } from "react";
import Link from "next/link";
import type { SupportMessageCategory, SupportMessageStatus } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePlatformSupportMessages, useResolveSupportMessage } from "@/hooks/useSupport";

const CATEGORY_LABELS: Record<SupportMessageCategory, string> = {
  TECHNICAL: "Duda técnica",
  PREMIUM_INTEREST: "Quiere Premium",
};

const CATEGORY_STYLES: Record<SupportMessageCategory, string> = {
  TECHNICAL: "bg-surface-muted text-muted",
  PREMIUM_INTEREST: "bg-accent-muted text-accent",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-AR");
}

export default function SupportMessagesPage() {
  const user = useRequireAuth();
  const isSuperadmin = user?.role === "SUPERADMIN";
  const [statusFilter, setStatusFilter] = useState<SupportMessageStatus | "">("OPEN");
  const { data: messages, isLoading } = usePlatformSupportMessages(
    isSuperadmin && statusFilter ? statusFilter : undefined,
  );
  const resolve = useResolveSupportMessage();

  if (!user) return null;
  if (!isSuperadmin) {
    return (
      <div className="mx-auto max-w-2xl p-8 font-sans">
        <p className="text-muted">Esta sección es solo para el staff del sistema.</p>
      </div>
    );
  }

  // Cuando statusFilter="" pedimos todo (sin filtro server-side); acá se
  // corta la lista igual, sin otro round-trip, si el usuario ya la cambió.
  const visible = isSuperadmin ? messages : undefined;

  return (
    <div className="mx-auto max-w-4xl p-8 font-sans">
      <Link href="/platform" className="text-sm text-muted underline">
        ← Comercios
      </Link>
      <div className="mb-1 mt-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Mensajes de soporte / venta</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SupportMessageStatus | "")}
          className="rounded border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="OPEN">Abiertos</option>
          <option value="RESOLVED">Resueltos</option>
          <option value="">Todos</option>
        </select>
      </div>
      <p className="mb-6 text-sm text-muted">
        Dudas técnicas y pedidos de pasar a Premium, de cualquier comercio (incluidos demos).
      </p>

      {isLoading && <p className="text-muted">Cargando…</p>}

      <ul className="space-y-3">
        {visible?.map((msg) => (
          <li key={msg.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${CATEGORY_STYLES[msg.category]}`}>
                    {CATEGORY_LABELS[msg.category]}
                  </span>
                  {msg.subject && <span className="font-medium text-foreground">{msg.subject}</span>}
                  <span className="text-xs text-muted">{formatDate(msg.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {msg.contactName ? `${msg.contactName} · ` : ""}
                  <a href={`mailto:${msg.contactEmail}`} className="underline">
                    {msg.contactEmail}
                  </a>
                  {msg.tenant?.name && ` · ${msg.tenant.name}`}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{msg.message}</p>
              </div>
              {msg.status === "OPEN" && (
                <button
                  onClick={() => resolve.mutate(msg.id)}
                  disabled={resolve.isPending}
                  className="shrink-0 rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Marcar resuelto
                </button>
              )}
            </div>
          </li>
        ))}
        {visible?.length === 0 && !isLoading && (
          <li className="py-6 text-center text-muted">No hay mensajes.</li>
        )}
      </ul>
    </div>
  );
}
