"use client";

import { useState } from "react";
import Link from "next/link";
import type { BulkPriceMode, ImportPreviewResult, BulkPricePreviewResult } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useCategories } from "@/hooks/useCatalog";
import {
  useDownloadImportTemplate,
  useImportPreview,
  useImportCommit,
  useBulkPricePreview,
  useBulkPriceApply,
} from "@/hooks/useProductsImport";
import { usePlan } from "@/hooks/usePlan";
import { ApiError } from "@/lib/api";

export default function CatalogBulkPage() {
  const user = useRequireAuth();
  const [tab, setTab] = useState<"import" | "price">("import");

  if (!user) return null;
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-2xl p-8 font-sans">
        <p className="text-muted">No tenés permiso para esta sección.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-8 font-sans">
      <Link href="/catalog" className="text-sm text-muted underline">
        ← Catálogo
      </Link>
      <h1 className="mb-6 mt-1 text-2xl font-semibold text-foreground">Importar / precios en lote</h1>

      <div className="mb-6 flex gap-4 border-b border-border text-sm">
        <button
          onClick={() => setTab("import")}
          className={`pb-2 ${tab === "import" ? "border-b-2 border-accent font-medium" : "text-muted"}`}
        >
          Importar productos
        </button>
        <button
          onClick={() => setTab("price")}
          className={`pb-2 ${tab === "price" ? "border-b-2 border-accent font-medium" : "text-muted"}`}
        >
          Precios en lote
        </button>
      </div>

      {tab === "import" ? <ImportTab /> : <BulkPriceTab />}
    </div>
  );
}

function ImportTab() {
  const downloadTemplate = useDownloadImportTemplate();
  const previewMutation = useImportPreview();
  const commitMutation = useImportCommit();
  const { isDemo, productsUsage, productsMax } = usePlan();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [committed, setCommitted] = useState<ImportPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    if (!file) return;
    setError(null);
    setCommitted(null);
    try {
      const result = await previewMutation.mutateAsync(file);
      setPreview(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo previsualizar el archivo");
    }
  }

  async function handleCommit() {
    if (!file) return;
    setError(null);
    try {
      const result = await commitMutation.mutateAsync(file);
      setCommitted(result);
      setPreview(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar la importación");
    }
  }

  const active = committed ?? preview;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Solo productos simples. La clave es el SKU: si ya existe, se actualiza; si no, se crea.
      </p>

      {isDemo && productsMax !== null && (
        <p className="rounded border border-accent-muted bg-accent-muted px-3 py-2 text-xs text-accent">
          La demo permite hasta {productsMax} productos en total ({productsUsage}/{productsMax} cargados).
          Un archivo que sume más SKU nuevos que ese margen se rechaza entero, sin importar nada.
        </p>
      )}

      <button
        onClick={() => void downloadTemplate.mutateAsync()}
        className="rounded border border-border px-3 py-1.5 text-sm underline"
      >
        Descargar plantilla (.xlsx)
      </button>

      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setCommitted(null);
          }}
          className="text-sm"
        />
        <button
          onClick={() => void handlePreview()}
          disabled={!file || previewMutation.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {previewMutation.isPending ? "Analizando…" : "Previsualizar"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {active && (
        <div className="space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="text-green-600">{active.summary.create} a crear</span>
            <span className="text-blue-600">{active.summary.update} a actualizar</span>
            <span className="text-red-600">{active.summary.error} con error</span>
          </div>

          {preview && !committed && active.summary.error < active.results.length && (
            <button
              onClick={() => void handleCommit()}
              disabled={commitMutation.isPending}
              className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {commitMutation.isPending ? "Importando…" : "Confirmar importación"}
            </button>
          )}
          {committed && <p className="text-sm text-green-600">Importación aplicada.</p>}

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-1.5 pr-3">Fila</th>
                <th className="py-1.5 pr-3">SKU</th>
                <th className="py-1.5 pr-3">Nombre</th>
                <th className="py-1.5 pr-3">Acción</th>
                <th className="py-1.5 pr-3">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {active.results.map((r) => (
                <tr key={r.row} className="border-b border-border">
                  <td className="py-1.5 pr-3 text-xs text-muted">{r.row}</td>
                  <td className="py-1.5 pr-3 text-xs">{r.sku ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-xs">{r.name ?? "—"}</td>
                  <td
                    className={`py-1.5 pr-3 text-xs ${
                      r.action === "error"
                        ? "text-red-600"
                        : r.action === "create"
                          ? "text-green-600"
                          : "text-blue-600"
                    }`}
                  >
                    {r.action === "error" ? "Error" : r.action === "create" ? "Crear" : "Actualizar"}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-muted">{r.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BulkPriceTab() {
  const { data: categories } = useCategories();
  const previewMutation = useBulkPricePreview();
  const applyMutation = useBulkPriceApply();

  const [categoryId, setCategoryId] = useState("");
  const [mode, setMode] = useState<BulkPriceMode>("PERCENT");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<BulkPricePreviewResult | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    setError(null);
    setApplied(null);
    const numValue = Number(value);
    if (!value || Number.isNaN(numValue)) {
      setError("Ingresá un valor numérico");
      return;
    }
    try {
      const result = await previewMutation.mutateAsync({
        categoryId: categoryId || undefined,
        mode,
        value: numValue,
      });
      setPreview(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo previsualizar");
    }
  }

  async function handleApply() {
    setError(null);
    const numValue = Number(value);
    try {
      const result = await applyMutation.mutateAsync({
        categoryId: categoryId || undefined,
        mode,
        value: numValue,
      });
      setApplied(result.updated);
      setPreview(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aplicar el cambio");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Aplica un ajuste de precio a todos los productos activos (opcionalmente filtrados por categoría).
      </p>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="text-xs text-muted">
          Categoría (opcional)
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-0.5 block rounded border border-border bg-surface px-2 py-1.5"
          >
            <option value="">Todas</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Tipo de ajuste
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as BulkPriceMode)}
            className="mt-0.5 block rounded border border-border bg-surface px-2 py-1.5"
          >
            <option value="PERCENT">Porcentaje (%)</option>
            <option value="FIXED_DELTA">Monto fijo ($)</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Valor (puede ser negativo)
          <input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-0.5 block w-32 rounded border border-border bg-surface px-2 py-1.5"
          />
        </label>
        <button
          onClick={() => void handlePreview()}
          disabled={previewMutation.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {previewMutation.isPending ? "Calculando…" : "Previsualizar"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {preview && (
        <div className="space-y-3">
          <p className="text-sm">
            Se van a actualizar <strong>{preview.affectedCount}</strong> producto(s).
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-1.5 pr-3">SKU</th>
                <th className="py-1.5 pr-3">Producto</th>
                <th className="py-1.5 pr-3 text-right">Precio actual</th>
                <th className="py-1.5 pr-3 text-right">Precio nuevo</th>
              </tr>
            </thead>
            <tbody>
              {preview.sample.map((s) => (
                <tr key={s.id} className="border-b border-border">
                  <td className="py-1.5 pr-3 text-xs">{s.sku}</td>
                  <td className="py-1.5 pr-3 text-xs">{s.name}</td>
                  <td className="py-1.5 pr-3 text-right text-xs">${s.oldPrice.toLocaleString("es-AR")}</td>
                  <td className="py-1.5 pr-3 text-right text-xs">${s.newPrice.toLocaleString("es-AR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.affectedCount > preview.sample.length && (
            <p className="text-xs text-muted">Mostrando una muestra de {preview.sample.length}.</p>
          )}
          <button
            onClick={() => void handleApply()}
            disabled={applyMutation.isPending || preview.affectedCount === 0}
            className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {applyMutation.isPending ? "Aplicando…" : "Aplicar a todos"}
          </button>
        </div>
      )}

      {applied !== null && <p className="text-sm text-green-600">Se actualizaron {applied} producto(s).</p>}
    </div>
  );
}
