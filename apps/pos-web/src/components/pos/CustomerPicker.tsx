"use client";

import { useState } from "react";
import type { Customer, CustomerDocType, CreateCustomerInput } from "@pos/shared-types";
import { useCustomers, useCreateCustomer } from "@/hooks/useCustomers";
import { ApiError } from "@/lib/api";

// Reutilizable en checkout (venta a cuenta corriente / Factura A) y en el
// ABM de clientes — buscar-o-crear en un solo control para no repetir la
// lógica de "crear cliente nuevo" en cada lugar que lo necesita.
export function CustomerPicker({
  selected,
  onSelect,
  placeholder = "Buscar cliente por nombre o CUIT/DNI…",
  createDefaults,
  docLabel = "CUIT/DNI (opcional)",
}: {
  selected: Customer | null;
  onSelect: (customer: Customer | null) => void;
  placeholder?: string;
  createDefaults?: Partial<CreateCustomerInput>;
  docLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDoc, setNewDoc] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const { data: results, isFetching } = useCustomers(open ? query : "");
  const createCustomer = useCreateCustomer();

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2 text-sm">
        <div>
          <p className="font-medium">{selected.name}</p>
          {selected.docNumber && (
            <p className="text-xs text-muted">
              {selected.docType} {selected.docNumber}
            </p>
          )}
        </div>
        <button type="button" onClick={() => onSelect(null)} className="text-xs underline">
          Cambiar
        </button>
      </div>
    );
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreateError(null);
    const docType: CustomerDocType | undefined =
      createDefaults?.docType ?? (newDoc.trim() ? (newDoc.trim().length === 11 ? "CUIT" : "DNI") : undefined);
    try {
      const customer = await createCustomer.mutateAsync({
        ...createDefaults,
        docType,
        docNumber: newDoc.trim() || undefined,
        name: newName.trim(),
        businessName: createDefaults?.taxCondition === "RESPONSABLE_INSCRIPTO" ? newName.trim() : undefined,
      });
      onSelect(customer);
      setCreating(false);
      setOpen(false);
      setQuery("");
      setNewName("");
      setNewDoc("");
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "No se pudo crear el cliente");
    }
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded border border-border bg-surface shadow-lg">
          {query.length > 0 && isFetching && <p className="p-2 text-xs text-muted">Buscando…</p>}
          {query.length > 0 &&
            results?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent-muted"
              >
                <p className="font-medium">{c.name}</p>
                {c.docNumber && (
                  <p className="text-xs text-muted">
                    {c.docType} {c.docNumber}
                  </p>
                )}
              </button>
            ))}
          {query.length > 0 && !isFetching && results?.length === 0 && !creating && (
            <div className="p-2">
              <p className="pb-1 text-xs text-muted">Sin resultados.</p>
              <button
                type="button"
                onClick={() => {
                  setCreating(true);
                  setNewName(query);
                }}
                className="text-xs underline"
              >
                Crear cliente nuevo
              </button>
            </div>
          )}
          {!creating && (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setNewName(query);
              }}
              className="block w-full border-t border-border px-3 py-2 text-left text-xs underline"
            >
              + Crear cliente nuevo
            </button>
          )}
          {creating && (
            <div className="space-y-2 border-t border-border p-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre / razón social"
                className="w-full rounded border border-border bg-surface px-2 py-1 text-sm"
              />
              <input
                value={newDoc}
                onChange={(e) => setNewDoc(e.target.value.replace(/\D/g, ""))}
                placeholder={docLabel}
                maxLength={11}
                className="w-full rounded border border-border bg-surface px-2 py-1 text-sm"
              />
              {createError && <p className="text-xs text-red-600">{createError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={createCustomer.isPending || !newName.trim()}
                  className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  {createCustomer.isPending ? "Creando…" : "Crear"}
                </button>
                <button type="button" onClick={() => setCreating(false)} className="text-xs underline">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
