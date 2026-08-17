"use client";

import { useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSuppliers, useCreateSupplier, useUpdateSupplier } from "@/hooks/useSuppliers";
import { ApiError } from "@/lib/api";

export default function SuppliersSettingsPage() {
  const user = useRequireAuth();
  const [q, setQ] = useState("");
  const { data: suppliers, isLoading } = useSuppliers(q);
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const canManage = user.role === "OWNER" || user.role === "ADMIN" || user.role === "MANAGER";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      await createSupplier.mutateAsync({ name: name.trim(), taxId: taxId || undefined, phone: phone || undefined });
      setName("");
      setTaxId("");
      setPhone("");
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el proveedor");
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    try {
      await updateSupplier.mutateAsync({ id, input: { isActive: !isActive } });
    } catch {
      // silencioso: el estado no cambia en la UI si falla
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Proveedores</h1>
        {canManage && (
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            {showCreate ? "Cerrar" : "+ Nuevo proveedor"}
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-4 text-sm">
          <label className="text-xs text-muted">
            Nombre
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-0.5 block w-48 rounded border border-border bg-surface px-2 py-1.5"
            />
          </label>
          <label className="text-xs text-muted">
            CUIT (opcional)
            <input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="mt-0.5 block w-32 rounded border border-border bg-surface px-2 py-1.5"
            />
          </label>
          <label className="text-xs text-muted">
            Teléfono (opcional)
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-0.5 block w-32 rounded border border-border bg-surface px-2 py-1.5"
            />
          </label>
          <button
            type="submit"
            disabled={createSupplier.isPending}
            className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Crear
          </button>
        </form>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <input
        placeholder="Buscar por nombre o CUIT…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 w-64 rounded border border-border bg-surface px-3 py-1.5 text-sm"
      />

      {isLoading && <p className="text-muted">Cargando…</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 pr-3">Nombre</th>
            <th className="py-2 pr-3">CUIT</th>
            <th className="py-2 pr-3">Teléfono</th>
            <th className="py-2 pr-3">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {suppliers?.map((s) => (
            <tr key={s.id} className="border-b border-border">
              <td className="py-2 pr-3">{s.name}</td>
              <td className="py-2 pr-3 text-xs text-muted">{s.taxId ?? "—"}</td>
              <td className="py-2 pr-3 text-xs text-muted">{s.phone ?? "—"}</td>
              <td className="py-2 pr-3 text-xs">
                <span className={s.isActive ? "text-green-600" : "text-red-600"}>
                  {s.isActive ? "Activo" : "Inactivo"}
                </span>
              </td>
              <td className="py-2 text-right text-xs">
                {canManage && (
                  <button onClick={() => void handleToggleActive(s.id, s.isActive)} className="underline">
                    {s.isActive ? "Desactivar" : "Activar"}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {suppliers?.length === 0 && !isLoading && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted">
                Sin proveedores todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
