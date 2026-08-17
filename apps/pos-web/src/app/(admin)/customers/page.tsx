"use client";

import { useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useCustomersList } from "@/hooks/useCustomers";
import { CustomerPicker } from "@/components/pos/CustomerPicker";

export default function CustomersPage() {
  const user = useRequireAuth();
  const [q, setQ] = useState("");
  const [withDebt, setWithDebt] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const { data: customers, isLoading } = useCustomersList({ q: q || undefined, withDebt });

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl p-8 font-sans">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          {showCreate ? "Cerrar" : "+ Nuevo cliente"}
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 max-w-sm">
          <CustomerPicker
            selected={null}
            onSelect={() => setShowCreate(false)}
            placeholder="Buscar o crear cliente…"
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <input
          placeholder="Buscar por nombre o CUIT/DNI…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64 rounded border border-border bg-surface px-3 py-1.5"
        />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={withDebt} onChange={(e) => setWithDebt(e.target.checked)} />
          Solo con deuda
        </label>
      </div>

      {isLoading && <p className="text-muted">Cargando…</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 pr-3">Nombre</th>
            <th className="py-2 pr-3">Documento</th>
            <th className="py-2 pr-3 text-right">Saldo</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {customers?.map((c) => {
            const balance = Number(c.accountBalance);
            return (
              <tr key={c.id} className="border-b border-border">
                <td className="py-2 pr-3">{c.name}</td>
                <td className="py-2 pr-3 text-xs text-muted">
                  {c.docNumber ? `${c.docType} ${c.docNumber}` : "—"}
                </td>
                <td className={`py-2 pr-3 text-right ${balance > 0 ? "text-red-600" : ""}`}>
                  ${balance.toLocaleString("es-AR")}
                </td>
                <td className="py-2 text-right">
                  <Link href={`/customers/${c.id}`} className="underline">
                    Ver
                  </Link>
                </td>
              </tr>
            );
          })}
          {customers?.length === 0 && !isLoading && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-muted">
                No hay clientes que coincidan con el filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
