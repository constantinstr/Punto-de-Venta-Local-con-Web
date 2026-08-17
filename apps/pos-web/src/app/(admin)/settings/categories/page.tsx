"use client";

import { useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/useCatalog";
import { ApiError } from "@/lib/api";

export default function CategoriesSettingsPage() {
  const user = useRequireAuth();
  const { data: categories, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const canManage = user.role === "OWNER" || user.role === "ADMIN" || user.role === "MANAGER";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) return;
    try {
      await createCategory.mutateAsync({ name: newName.trim(), parentId: newParentId || undefined });
      setNewName("");
      setNewParentId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la categoría");
    }
  }

  async function handleSaveEdit(id: string) {
    setError(null);
    try {
      await updateCategory.mutateAsync({ id, input: { name: editName.trim() } });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteCategory.mutateAsync(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar la categoría");
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Categorías</h1>

      {canManage && (
        <form onSubmit={handleCreate} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-4 text-sm">
          <label className="text-xs text-muted">
            Nombre
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-0.5 block w-48 rounded border border-border bg-surface px-2 py-1.5"
            />
          </label>
          <label className="text-xs text-muted">
            Categoría padre (opcional)
            <select
              value={newParentId}
              onChange={(e) => setNewParentId(e.target.value)}
              className="mt-0.5 block rounded border border-border bg-surface px-2 py-1.5"
            >
              <option value="">Sin padre</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={createCategory.isPending}
            className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            + Crear
          </button>
        </form>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {isLoading && <p className="text-muted">Cargando…</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 pr-3">Nombre</th>
            <th className="py-2 pr-3">Categoría padre</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {categories?.map((c) => (
            <tr key={c.id} className="border-b border-border">
              <td className="py-2 pr-3">
                {editingId === c.id ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="rounded border border-border bg-surface px-2 py-1 text-sm"
                    autoFocus
                  />
                ) : (
                  c.name
                )}
              </td>
              <td className="py-2 pr-3 text-xs text-muted">
                {c.parentId ? (categories.find((p) => p.id === c.parentId)?.name ?? "—") : "—"}
              </td>
              <td className="py-2 text-right text-xs">
                {canManage &&
                  (editingId === c.id ? (
                    <>
                      <button onClick={() => void handleSaveEdit(c.id)} className="mr-2 underline">
                        Guardar
                      </button>
                      <button onClick={() => setEditingId(null)} className="underline">
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(c.id);
                          setEditName(c.name);
                        }}
                        className="mr-2 underline"
                      >
                        Editar
                      </button>
                      <button onClick={() => void handleDelete(c.id)} className="text-red-600 underline">
                        Borrar
                      </button>
                    </>
                  ))}
              </td>
            </tr>
          ))}
          {categories?.length === 0 && !isLoading && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-muted">
                Sin categorías todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
