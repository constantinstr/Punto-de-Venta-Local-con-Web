"use client";

import { useState } from "react";
import Link from "next/link";
import { findSaleInvoice, findCreditNote } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores } from "@/hooks/useCatalog";
import { useOrdersList } from "@/hooks/useOrders";

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Completada",
  CANCELLED: "Anulada",
};

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "text-foreground",
  CANCELLED: "text-red-600",
};

export default function SalesPage() {
  const user = useRequireAuth();
  const { data: stores } = useStores();
  const [storeId, setStoreId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useOrdersList({
    storeId: storeId || undefined,
    status: status || undefined,
    q: q || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    limit: 25,
  });

  if (!user) return null;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="mx-auto max-w-5xl p-8 font-sans">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Ventas</h1>

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <input
          placeholder="Nro de venta…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="w-32 rounded border border-border bg-surface px-3 py-1.5"
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
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded border border-border bg-surface px-3 py-1.5"
        >
          <option value="">Todos los estados</option>
          <option value="COMPLETED">Completadas</option>
          <option value="CANCELLED">Anuladas</option>
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          className="rounded border border-border bg-surface px-3 py-1.5"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          className="rounded border border-border bg-surface px-3 py-1.5"
        />
      </div>

      {isLoading && <p className="text-muted">Cargando…</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 pr-3">Nro</th>
            <th className="py-2 pr-3">Fecha</th>
            <th className="py-2 pr-3">Cajero</th>
            <th className="py-2 pr-3">Cliente</th>
            <th className="py-2 pr-3 text-right">Total</th>
            <th className="py-2 pr-3">Estado</th>
            <th className="py-2 pr-3">Comprobante</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {data?.data.map((order) => (
            <tr key={order.id} className="border-b border-border">
              <td className="py-2 pr-3 font-mono text-xs">#{order.orderNumber}</td>
              <td className="py-2 pr-3 text-xs text-muted">{new Date(order.createdAt).toLocaleString("es-AR")}</td>
              <td className="py-2 pr-3">{order.user.fullName}</td>
              <td className="py-2 pr-3">{order.customer?.name ?? "—"}</td>
              <td className="py-2 pr-3 text-right">${Number(order.total).toLocaleString("es-AR")}</td>
              <td className={`py-2 pr-3 ${STATUS_STYLES[order.status] ?? ""}`}>
                {STATUS_LABELS[order.status] ?? order.status}
              </td>
              <td className="py-2 pr-3 text-xs text-muted">
                {findSaleInvoice(order)?.invoiceType ?? "—"}
                {findCreditNote(order) && (
                  <span className="ml-1 text-red-600">(NC)</span>
                )}
              </td>
              <td className="py-2 text-right">
                <Link href={`/sales/${order.id}`} className="underline">
                  Ver
                </Link>
              </td>
            </tr>
          ))}
          {data?.data.length === 0 && !isLoading && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-muted">
                No hay ventas que coincidan con el filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {data && data.total > data.limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Página {data.page} de {totalPages} — {data.total} venta(s)
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
