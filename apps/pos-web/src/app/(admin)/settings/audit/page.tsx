"use client";

import { useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuditLog } from "@/hooks/useAudit";

const ACTION_LABELS: Record<string, string> = {
  "stock.adjust": "Ajuste de stock",
  "order.cancel": "Anulación de venta",
  "user.create": "Alta de empleado",
  "user.update": "Edición de empleado",
  "customer.account.payment": "Pago de cuenta corriente",
  "customer.account.adjustment": "Ajuste de cuenta corriente",
  "category.create": "Alta de categoría",
  "category.update": "Edición de categoría",
  "category.delete": "Baja de categoría",
};

export default function AuditSettingsPage() {
  const user = useRequireAuth();
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const canView = user?.role === "OWNER" || user?.role === "ADMIN";
  const { data, isLoading } = useAuditLog({
    entityType: entityType || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    limit: 30,
  });

  if (!user) return null;
  if (!canView) {
    return (
      <div className="mx-auto max-w-2xl p-8 font-sans">
        <p className="text-muted">No tenés permiso para ver la auditoría.</p>
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="mx-auto max-w-4xl p-8 font-sans">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Auditoría</h1>

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <select
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          className="rounded border border-border bg-surface px-3 py-1.5"
        >
          <option value="">Todas las entidades</option>
          <option value="StockLevel">Stock</option>
          <option value="Order">Ventas</option>
          <option value="User">Empleados</option>
          <option value="Customer">Clientes</option>
          <option value="Category">Categorías</option>
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
            <th className="py-2 pr-3">Fecha</th>
            <th className="py-2 pr-3">Usuario</th>
            <th className="py-2 pr-3">Acción</th>
            <th className="py-2 pr-3">Entidad</th>
            <th className="py-2 pr-3">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {data?.data.map((entry) => (
            <tr key={entry.id} className="border-b border-border align-top">
              <td className="py-2 pr-3 text-xs text-muted">{new Date(entry.createdAt).toLocaleString("es-AR")}</td>
              <td className="py-2 pr-3 text-xs">{entry.userEmail}</td>
              <td className="py-2 pr-3">{ACTION_LABELS[entry.action] ?? entry.action}</td>
              <td className="py-2 pr-3 text-xs text-muted">{entry.entityType}</td>
              <td className="py-2 pr-3 text-xs text-muted">
                {entry.metadata ? JSON.stringify(entry.metadata) : "—"}
              </td>
            </tr>
          ))}
          {data?.data.length === 0 && !isLoading && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted">
                Sin registros para el filtro elegido.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {data && data.total > data.limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Página {data.page} de {totalPages} — {data.total} registro(s)
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
