"use client";

import { useState } from "react";
import Link from "next/link";
import type { Store } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores, useCreateStore, useUpdateStore } from "@/hooks/useCatalog";
import { ApiError } from "@/lib/api";

export default function StoresPage() {
  const user = useRequireAuth();
  const { data: stores, isLoading } = useStores();
  const createStore = useCreateStore();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const canManage = user.role === "OWNER" || user.role === "ADMIN";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      await createStore.mutateAsync({
        name: name.trim(),
        address: address.trim() || undefined,
      });
      setName("");
      setAddress("");
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el local");
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link href="/settings" className="text-sm text-muted underline">
        ← Configuración
      </Link>
      <div className="mb-1 mt-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Locales</h1>
        {canManage && (
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
          >
            {showCreate ? "Cerrar" : "+ Nuevo local"}
          </button>
        )}
      </div>
      <p className="mb-6 text-sm text-muted">
        Cada local tiene su propio stock, sus cajas y su punto de venta de AFIP.
      </p>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-4"
        >
          <label className="text-xs text-muted">
            Nombre
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Sucursal Centro"
              className="mt-0.5 block w-52 rounded border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-muted">
            Dirección (opcional)
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={createStore.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            Crear
          </button>
        </form>
      )}

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {isLoading && <p className="text-muted">Cargando…</p>}

      <ul className="space-y-2">
        {stores?.map((store) => (
          <StoreRow key={store.id} store={store} canManage={canManage} />
        ))}
      </ul>

      {stores?.length === 0 && !isLoading && (
        <p className="py-6 text-center text-muted">Todavía no hay locales.</p>
      )}
    </div>
  );
}

function StoreRow({ store, canManage }: { store: Store; canManage: boolean }) {
  const updateStore = useUpdateStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    try {
      await updateStore.mutateAsync({
        id: store.id,
        input: { name: name.trim(), address: address.trim() },
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            Nombre
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-0.5 block w-48 rounded border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-muted">
            Dirección
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={() => void handleSave()}
            disabled={updateStore.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            Guardar
          </button>
          <button onClick={() => setEditing(false)} className="px-2 text-sm underline">
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">{store.name}</p>
            <p className="text-sm text-muted">{store.address || "Sin dirección cargada"}</p>
          </div>
          {canManage && (
            <button onClick={() => setEditing(true)} className="text-sm underline">
              Editar
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </li>
  );
}
