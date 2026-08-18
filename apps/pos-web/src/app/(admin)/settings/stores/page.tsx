"use client";

import { useState } from "react";
import Link from "next/link";
import type { Store } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  useStores,
  useCreateStore,
  useUpdateStore,
  useUploadStoreLogo,
} from "@/hooks/useCatalog";
import { usePlan } from "@/hooks/usePlan";
import { ApiError, apiFileUrl } from "@/lib/api";
import { PremiumBadge } from "@/components/common/PremiumBadge";
import { UpgradeModal } from "@/components/common/UpgradeModal";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function StoresPage() {
  const user = useRequireAuth();
  const { data: stores, isLoading } = useStores();
  const createStore = useCreateStore();

  const [showCreate, setShowCreate] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isDemo, storesMax } = usePlan();

  if (!user) return null;
  const canManage = user.role === "OWNER" || user.role === "ADMIN";
  const atStoreCap = isDemo && storesMax !== null && (stores?.length ?? 0) >= storesMax;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      await createStore.mutateAsync({
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setName("");
      setAddress("");
      setPhone("");
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
          atStoreCap ? (
            <>
              <button
                onClick={() => setShowUpgrade(true)}
                className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground opacity-60"
              >
                + Nuevo local <PremiumBadge />
              </button>
              {showUpgrade && (
                <UpgradeModal
                  reason={`La demo permite un solo local. Registrá tu comercio para abrir sucursales.`}
                  onClose={() => setShowUpgrade(false)}
                />
              )}
            </>
          ) : (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
            >
              {showCreate ? "Cerrar" : "+ Nuevo local"}
            </button>
          )
        )}
      </div>
      <p className="mb-6 text-sm text-muted">
        Cada local tiene su propio stock, sus cajas y su punto de venta de AFIP.
        Nombre, dirección, teléfono y logo salen impresos en el ticket y la
        factura.
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
          <label className="text-xs text-muted">
            Teléfono (opcional)
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-0.5 block w-40 rounded border border-border bg-surface px-2 py-1.5 text-sm"
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
  const uploadLogo = useUploadStoreLogo(store.id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address ?? "");
  const [phone, setPhone] = useState(store.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    try {
      await updateStore.mutateAsync({
        id: store.id,
        input: { name: name.trim(), address: address.trim(), phone: phone.trim() },
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);

    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setLogoError("Formato no soportado — usá JPG, PNG o WebP.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("El logo no puede superar los 5 MB.");
      e.target.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
    try {
      await uploadLogo.mutateAsync(file);
    } catch (err) {
      setLogoError(err instanceof ApiError ? err.message : "No se pudo subir el logo");
    } finally {
      URL.revokeObjectURL(objectUrl);
      setLogoPreview(null);
      e.target.value = "";
    }
  }

  const logoDisplayUrl = logoPreview ?? (store.logoUrl ? apiFileUrl(store.logoUrl) : null);

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface-muted">
          {logoDisplayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen dinámica servida por la API, no un asset del build
            <img src={logoDisplayUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-center text-[10px] leading-tight text-muted">Sin logo</span>
          )}
        </div>

        <div className="flex-1">
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
              <label className="text-xs text-muted">
                Teléfono
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-0.5 block w-36 rounded border border-border bg-surface px-2 py-1.5 text-sm"
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
                <p className="text-sm text-muted">{store.phone || "Sin teléfono cargado"}</p>
              </div>
              {canManage && (
                <button onClick={() => setEditing(true)} className="text-sm underline">
                  Editar
                </button>
              )}
            </div>
          )}
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}

          {canManage && (
            <div className="mt-2">
              <label className="text-xs text-muted">
                {store.logoUrl ? "Cambiar logo" : "Subir logo"}
                <input
                  type="file"
                  accept={ACCEPTED_LOGO_TYPES.join(",")}
                  onChange={handleLogoChange}
                  disabled={uploadLogo.isPending}
                  className="mt-0.5 block text-xs"
                />
              </label>
              <p className="mt-0.5 text-xs text-muted">JPG, PNG o WebP, máx. 5 MB.</p>
              {uploadLogo.isPending && <p className="mt-0.5 text-xs text-muted">Subiendo…</p>}
              {logoError && <p className="mt-0.5 text-xs text-danger">{logoError}</p>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
