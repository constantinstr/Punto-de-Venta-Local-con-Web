"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductType, VatCondition, CreateVariantInput, CreateBundleItemInput, StockEntryInput } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useCategories, useCreateProduct, useProducts, useStores } from "@/hooks/useCatalog";
import { ApiError } from "@/lib/api";

const VAT_OPTIONS: { value: VatCondition; label: string }[] = [
  { value: "IVA_21", label: "IVA 21%" },
  { value: "IVA_10_5", label: "IVA 10.5%" },
  { value: "IVA_0", label: "IVA 0%" },
  { value: "EXENTO", label: "Exento" },
  { value: "NO_GRAVADO", label: "No gravado" },
];

export default function NewProductPage() {
  const user = useRequireAuth();
  const router = useRouter();
  const { data: categories } = useCategories();
  const { data: stores } = useStores();
  const { data: allProducts } = useProducts({});
  const createProduct = useCreateProduct();

  const [type, setType] = useState<ProductType>("SIMPLE");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [price, setPrice] = useState("");
  const [vatCondition, setVatCondition] = useState<VatCondition>("IVA_21");
  const [initialStock, setInitialStock] = useState<StockEntryInput[]>([]);
  const [variants, setVariants] = useState<CreateVariantInput[]>([]);
  const [bundleItems, setBundleItems] = useState<CreateBundleItemInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const componentCandidates = (allProducts ?? []).filter((p) => p.type !== "BUNDLE");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createProduct.mutateAsync({
        categoryId: categoryId || undefined,
        sku,
        barcode: type === "VARIABLE" ? undefined : barcode || undefined,
        name,
        costPrice: Number(costPrice),
        price: Number(price),
        vatCondition,
        type,
        variants: type === "VARIABLE" ? variants : undefined,
        bundleItems: type === "BUNDLE" ? bundleItems : undefined,
        initialStock: type === "SIMPLE" ? initialStock : undefined,
      });
      router.push("/catalog");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el producto");
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="mb-6 text-2xl font-semibold text-foreground  ">Nuevo producto</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex gap-2">
          {(["SIMPLE", "VARIABLE", "BUNDLE"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-full px-4 py-1.5 text-sm ${
                type === t
                  ? "bg-accent text-white  "
                  : "border border-border  "
              }`}
            >
              {t === "SIMPLE" ? "Simple" : t === "VARIABLE" ? "Variable" : "Combo"}
            </button>
          ))}
        </div>

        <section className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4  ">
          <Field label="SKU" value={sku} onChange={setSku} required />
          <Field label="Nombre" value={name} onChange={setName} required />
          {type !== "VARIABLE" && (
            <Field label="Código de barras" value={barcode} onChange={setBarcode} />
          )}
          <label className="block text-sm">
            Categoría
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
            >
              <option value="">Sin categoría</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="Costo" type="number" value={costPrice} onChange={setCostPrice} required />
          <Field label="Precio de venta" type="number" value={price} onChange={setPrice} required />
          <label className="block text-sm">
            IVA
            <select
              value={vatCondition}
              onChange={(e) => setVatCondition(e.target.value as VatCondition)}
              className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
            >
              {VAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        {type === "SIMPLE" && (
          <StockSection stores={stores ?? []} entries={initialStock} onChange={setInitialStock} />
        )}

        {type === "VARIABLE" && (
          <VariantsSection stores={stores ?? []} variants={variants} onChange={setVariants} />
        )}

        {type === "BUNDLE" && (
          <BundleSection candidates={componentCandidates} items={bundleItems} onChange={setBundleItems} />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={createProduct.isPending}
          className="rounded bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-50  "
        >
          {createProduct.isPending ? "Creando…" : "Crear producto"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={type === "number" ? "0.01" : undefined}
        className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
      />
    </label>
  );
}

function StockSection({
  stores,
  entries,
  onChange,
}: {
  stores: { id: string; name: string }[];
  entries: StockEntryInput[];
  onChange: (entries: StockEntryInput[]) => void;
}) {
  return (
    <section className="rounded-lg border border-border p-4  ">
      <h2 className="mb-3 text-sm font-medium text-muted">Stock inicial por local (opcional)</h2>
      {stores.map((store) => {
        const entry = entries.find((e) => e.storeId === store.id);
        return (
          <div key={store.id} className="mb-2 flex items-center gap-3 text-sm">
            <span className="w-40">{store.name}</span>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={entry?.quantity ?? ""}
              onChange={(e) => {
                const quantity = Number(e.target.value);
                const rest = entries.filter((x) => x.storeId !== store.id);
                onChange(e.target.value === "" ? rest : [...rest, { storeId: store.id, quantity }]);
              }}
              className="w-28 rounded border border-border px-2 py-1   bg-surface"
            />
          </div>
        );
      })}
      {stores.length === 0 && <p className="text-sm text-muted">No hay locales creados todavía.</p>}
    </section>
  );
}

function VariantsSection({
  stores,
  variants,
  onChange,
}: {
  stores: { id: string; name: string }[];
  variants: CreateVariantInput[];
  onChange: (v: CreateVariantInput[]) => void;
}) {
  function addVariant() {
    onChange([...variants, { sku: "", attributes: { atributo: "" } }]);
  }

  function updateVariant(index: number, patch: Partial<CreateVariantInput>) {
    onChange(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function removeVariant(index: number) {
    onChange(variants.filter((_, i) => i !== index));
  }

  return (
    <section className="rounded-lg border border-border p-4  ">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">Variantes (talle/color/etc.)</h2>
        <button type="button" onClick={addVariant} className="text-sm underline">
          + Agregar variante
        </button>
      </div>

      {variants.map((v, i) => (
        <div key={i} className="mb-4 space-y-2 rounded border border-border p-3  ">
          <div className="flex gap-2">
            <input
              placeholder="SKU"
              value={v.sku}
              onChange={(e) => updateVariant(i, { sku: e.target.value })}
              className="flex-1 rounded border border-border px-2 py-1 text-sm   bg-surface"
            />
            <input
              placeholder="Código de barras"
              value={v.barcode ?? ""}
              onChange={(e) => updateVariant(i, { barcode: e.target.value })}
              className="flex-1 rounded border border-border px-2 py-1 text-sm   bg-surface"
            />
            <input
              placeholder="Precio (opcional)"
              type="number"
              value={v.price ?? ""}
              onChange={(e) => updateVariant(i, { price: e.target.value ? Number(e.target.value) : undefined })}
              className="w-32 rounded border border-border px-2 py-1 text-sm   bg-surface"
            />
            <button type="button" onClick={() => removeVariant(i)} className="text-sm text-red-600">
              Quitar
            </button>
          </div>

          <AttributesEditor
            attributes={v.attributes}
            onChange={(attributes) => updateVariant(i, { attributes })}
          />

          <div className="flex flex-wrap gap-3">
            {stores.map((store) => {
              const entry = v.initialStock?.find((e) => e.storeId === store.id);
              return (
                <label key={store.id} className="flex items-center gap-1 text-xs text-muted">
                  {store.name}:
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={entry?.quantity ?? ""}
                    onChange={(e) => {
                      const rest = (v.initialStock ?? []).filter((x) => x.storeId !== store.id);
                      const initialStock =
                        e.target.value === ""
                          ? rest
                          : [...rest, { storeId: store.id, quantity: Number(e.target.value) }];
                      updateVariant(i, { initialStock });
                    }}
                    className="w-16 rounded border border-border px-1 py-0.5   bg-surface"
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {variants.length === 0 && <p className="text-sm text-muted">Agregá al menos una variante.</p>}
    </section>
  );
}

function AttributesEditor({
  attributes,
  onChange,
}: {
  attributes: Record<string, string>;
  onChange: (attrs: Record<string, string>) => void;
}) {
  const pairs = Object.entries(attributes);

  function updatePair(index: number, key: string, value: string) {
    const next = [...pairs];
    next[index] = [key, value];
    onChange(Object.fromEntries(next));
  }

  function addPair() {
    onChange({ ...attributes, "": "" });
  }

  function removePair(index: number) {
    onChange(Object.fromEntries(pairs.filter((_, i) => i !== index)));
  }

  return (
    <div className="space-y-1">
      {pairs.map(([key, value], i) => (
        <div key={i} className="flex gap-2">
          <input
            placeholder="atributo (ej. color)"
            value={key}
            onChange={(e) => updatePair(i, e.target.value, value)}
            className="w-32 rounded border border-border px-2 py-1 text-xs   bg-surface"
          />
          <input
            placeholder="valor (ej. Verde)"
            value={value}
            onChange={(e) => updatePair(i, key, e.target.value)}
            className="w-32 rounded border border-border px-2 py-1 text-xs   bg-surface"
          />
          <button type="button" onClick={() => removePair(i)} className="text-xs text-red-600">
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={addPair} className="text-xs underline">
        + atributo
      </button>
    </div>
  );
}

function BundleSection({
  candidates,
  items,
  onChange,
}: {
  candidates: { id: string; name: string; sku: string; variants: { id: string; sku: string; attributes: Record<string, string> }[] }[];
  items: CreateBundleItemInput[];
  onChange: (items: CreateBundleItemInput[]) => void;
}) {
  function addItem() {
    if (candidates.length === 0) return;
    onChange([...items, { componentProductId: candidates[0].id, quantity: 1 }]);
  }

  function updateItem(index: number, patch: Partial<CreateBundleItemInput>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <section className="rounded-lg border border-border p-4  ">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">Componentes del combo</h2>
        <button type="button" onClick={addItem} className="text-sm underline">
          + Agregar componente
        </button>
      </div>

      {items.map((item, i) => {
        const product = candidates.find((c) => c.id === item.componentProductId);
        return (
          <div key={i} className="mb-2 flex items-center gap-2 text-sm">
            <select
              value={item.componentProductId}
              onChange={(e) => updateItem(i, { componentProductId: e.target.value, componentVariantId: undefined })}
              className="flex-1 rounded border border-border px-2 py-1   bg-surface"
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.sku})
                </option>
              ))}
            </select>

            {product && product.variants.length > 0 && (
              <select
                value={item.componentVariantId ?? ""}
                onChange={(e) => updateItem(i, { componentVariantId: e.target.value || undefined })}
                className="rounded border border-border px-2 py-1   bg-surface"
              >
                <option value="">Cualquier variante</option>
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {Object.values(v.attributes).join(" / ")}
                  </option>
                ))}
              </select>
            )}

            <input
              type="number"
              min={0.001}
              step="0.001"
              value={item.quantity}
              onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
              className="w-20 rounded border border-border px-2 py-1   bg-surface"
            />
            <button type="button" onClick={() => removeItem(i)} className="text-red-600">
              Quitar
            </button>
          </div>
        );
      })}
      {items.length === 0 && <p className="text-sm text-muted">Agregá al menos un componente.</p>}
    </section>
  );
}
