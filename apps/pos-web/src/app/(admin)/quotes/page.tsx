"use client";

import { useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores } from "@/hooks/useCatalog";
import { useQuotesList } from "@/hooks/useQuotes";

const STATE_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  EXPIRED: "Vencido",
  CONVERTED: "Convertido",
  CANCELLED: "Anulado",
};

const STATE_STYLES: Record<string, string> = {
  OPEN: "text-foreground",
  EXPIRED: "text-amber-600",
  CONVERTED: "text-green-600",
  CANCELLED: "text-red-600",
};

export default function QuotesPage() {
  const user = useRequireAuth();
  const { data: stores } = useStores();
  const [storeId, setStoreId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuotesList({
    storeId: storeId || undefined,
    q: q || undefined,
    page,
    limit: 25,
  });

  if (!user) return null;
  if (user.role === "CASHIER") {
    return (
      <div className="mx-auto max-w-2xl p-8 font-sans">
        <p className="text-muted">No tenés permiso para esta sección.</p>
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="mx-auto max-w-5xl p-8 font-sans">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Presupuestos</h1>

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <input
          placeholder="Nro de presupuesto…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="w-40 rounded border border-border bg-surface px-3 py-1.5"
        />
        <select
          value={storeId}
          onChange={(e) => {
            setStoreId(e.target.value);
            setPage(1);
          }}
          className="rounded border border-border bg-surface px-3 py-1.5"
        >
          <option value="">Todos los locales</option>
          {stores?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-muted">Cargando…</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 pr-3">Nro</th>
            <th className="py-2 pr-3">Fecha</th>
            <th className="py-2 pr-3">Vendedor</th>
            <th className="py-2 pr-3">Cliente</th>
            <th className="py-2 pr-3 text-right">Total</th>
            <th className="py-2 pr-3">Válido hasta</th>
            <th className="py-2 pr-3">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {data?.data.map((quote) => (
            <tr key={quote.id} className="border-b border-border">
              <td className="py-2 pr-3 font-mono text-xs">#{quote.quoteNumber}</td>
              <td className="py-2 pr-3 text-xs text-muted">{new Date(quote.createdAt).toLocaleString("es-AR")}</td>
              <td className="py-2 pr-3">{quote.user.fullName}</td>
              <td className="py-2 pr-3">
                {quote.customer ? `${quote.customer.name} ${quote.customer.lastName ?? ""}` : "—"}
              </td>
              <td className="py-2 pr-3 text-right">${Number(quote.total).toLocaleString("es-AR")}</td>
              <td className="py-2 pr-3 text-xs text-muted">{new Date(quote.validUntil).toLocaleDateString("es-AR")}</td>
              <td className={`py-2 pr-3 ${STATE_STYLES[quote.state] ?? ""}`}>
                {STATE_LABELS[quote.state] ?? quote.state}
              </td>
              <td className="py-2 text-right">
                <Link href={`/quotes/${quote.id}`} className="underline">
                  Ver
                </Link>
              </td>
            </tr>
          ))}
          {data?.data.length === 0 && !isLoading && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-muted">
                No hay presupuestos que coincidan con el filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {data && data.total > data.limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Página {data.page} de {totalPages} — {data.total} presupuesto(s)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-border px-3 py-1 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border border-border px-3 py-1 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
