"use client";

import { use, useState } from "react";
import type { VatCondition } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  useProduct,
  useUpdateProduct,
  useUploadProductImage,
  useAddVariant,
  useRemoveVariant,
  useAddBundleItem,
  useRemoveBundleItem,
  useProducts,
} from "@/hooks/useCatalog";
import { ApiError, apiFileUrl } from "@/lib/api";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const VAT_OPTIONS: { value: VatCondition; label: string }[] = [
  { value: "IVA_21", label: "IVA 21%" },
  { value: "IVA_10_5", label: "IVA 10.5%" },
  { value: "IVA_0", label: "IVA 0%" },
  { value: "EXENTO", label: "Exento" },
  { value: "NO_GRAVADO", label: "No gravado" },
];

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useRequireAuth();
  const { data: product, isLoading } = useProduct(id);

  if (!user) return null;
  if (isLoading || !product) return <p className="p-8 text-muted">Cargando…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8 font-sans">
      <h1 className="text-2xl font-semibold text-foreground  ">{product.name}</h1>

      <ImagePanel productId={id} imageUrl={product.imageUrl} />

      <EditBasicFields productId={id} product={product} />

      {product.type === "VARIABLE" && <VariantsPanel productId={id} product={product} />}
      {product.type === "BUNDLE" && <BundlePanel productId={id} product={product} />}
    </div>
  );
}

function ImagePanel({ productId, imageUrl }: { productId: string; imageUrl: string | null }) {
  const upload = useUploadProductImage(productId);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Formato no soportado — usá JPG, PNG o WebP.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("La imagen no puede superar los 5 MB.");
      e.target.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    try {
      await upload.mutateAsync(file);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo subir la imagen");
    } finally {
      URL.revokeObjectURL(objectUrl);
      setPreview(null);
      e.target.value = "";
    }
  }

  const displayUrl = preview ?? (imageUrl ? apiFileUrl(imageUrl) : null);

  return (
    <section className="flex items-center gap-4 rounded-lg border border-border p-4 text-sm  ">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen dinámica servida por la API, no un asset del build
          <img src={displayUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted">Sin imagen</span>
        )}
      </div>
      <div>
        <input
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          onChange={handleFileChange}
          disabled={upload.isPending}
          className="text-xs"
        />
        <p className="mt-1 text-xs text-muted">JPG, PNG o WebP, máx. 5 MB.</p>
        {upload.isPending && <p className="mt-1 text-xs text-muted">Subiendo…</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </section>
  );
}

function EditBasicFields({
  productId,
  product,
}: {
  productId: string;
  product: {
    name: string;
    barcode: string | null;
    costPrice: string;
    price: string;
    vatCondition: VatCondition;
    isActive: boolean;
  };
}) {
  const update = useUpdateProduct(productId);
  const [name, setName] = useState(product.name);
  const [costPrice, setCostPrice] = useState(product.costPrice);
  const [price, setPrice] = useState(product.price);
  const [vatCondition, setVatCondition] = useState(product.vatCondition);
  const [isActive, setIsActive] = useState(product.isActive);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await update.mutateAsync({ name, costPrice: Number(costPrice), price: Number(price), vatCondition, isActive });
      setMessage("Guardado.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  return (
    <form onSubmit={handleSave} className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 text-sm  ">
      <label className="col-span-2 block">
        Nombre
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
        />
      </label>
      <label className="block">
        Costo
        <input
          type="number"
          value={costPrice}
          onChange={(e) => setCostPrice(e.target.value)}
          className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
        />
      </label>
      <label className="block">
        Precio
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
        />
      </label>
      <label className="block">
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
      <label className="flex items-end gap-2">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Activo
      </label>

      {message && <p className="col-span-2 text-muted">{message}</p>}

      <button
        type="submit"
        disabled={update.isPending}
        className="col-span-2 rounded bg-accent py-2 text-white disabled:opacity-50  "
      >
        Guardar cambios
      </button>
    </form>
  );
}

function VariantsPanel({
  productId,
  product,
}: {
  productId: string;
  product: { variants: { id: string; sku: string; barcode: string | null; attributes: Record<string, string> }[] };
}) {
  const addVariant = useAddVariant(productId);
  const removeVariant = useRemoveVariant();
  const [sku, setSku] = useState("");
  const [attrKey, setAttrKey] = useState("");
  const [attrValue, setAttrValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addVariant.mutateAsync({ sku, attributes: { [attrKey]: attrValue } });
      setSku("");
      setAttrKey("");
      setAttrValue("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar la variante");
    }
  }

  return (
    <section className="rounded-lg border border-border p-4 text-sm  ">
      <h2 className="mb-3 font-medium text-muted">Variantes</h2>
      <ul className="mb-4 space-y-1">
        {product.variants.map((v) => (
          <li key={v.id} className="flex items-center justify-between">
            <span>
              {v.sku} — {Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(", ")}
            </span>
            <button onClick={() => removeVariant.mutate(v.id)} className="text-red-600">
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          placeholder="SKU"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          required
          className="flex-1 rounded border border-border px-2 py-1   bg-surface"
        />
        <input
          placeholder="atributo"
          value={attrKey}
          onChange={(e) => setAttrKey(e.target.value)}
          required
          className="w-28 rounded border border-border px-2 py-1   bg-surface"
        />
        <input
          placeholder="valor"
          value={attrValue}
          onChange={(e) => setAttrValue(e.target.value)}
          required
          className="w-28 rounded border border-border px-2 py-1   bg-surface"
        />
        <button type="submit" className="rounded bg-accent px-3 text-white  ">
          Agregar
        </button>
      </form>
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </section>
  );
}

function BundlePanel({
  productId,
  product,
}: {
  productId: string;
  product: {
    bundleComponents?: {
      id: string;
      componentProduct: { name: string; sku: string };
      componentVariant: { attributes: Record<string, string> } | null;
      quantity: string;
    }[];
  };
}) {
  const addItem = useAddBundleItem(productId);
  const removeItem = useRemoveBundleItem();
  const { data: allProducts } = useProducts({});
  const candidates = (allProducts ?? []).filter((p) => p.type !== "BUNDLE" && p.id !== productId);
  const [componentProductId, setComponentProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addItem.mutateAsync({ componentProductId, quantity: Number(quantity) });
      setComponentProductId("");
      setQuantity("1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar el componente");
    }
  }

  return (
    <section className="rounded-lg border border-border p-4 text-sm  ">
      <h2 className="mb-3 font-medium text-muted">Componentes del combo</h2>
      <ul className="mb-4 space-y-1">
        {product.bundleComponents?.map((item) => (
          <li key={item.id} className="flex items-center justify-between">
            <span>
              {item.componentProduct.name}
              {item.componentVariant ? ` (${Object.values(item.componentVariant.attributes).join(" / ")})` : ""} ×{" "}
              {item.quantity}
            </span>
            <button onClick={() => removeItem.mutate(item.id)} className="text-red-600">
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="flex gap-2">
        <select
          value={componentProductId}
          onChange={(e) => setComponentProductId(e.target.value)}
          required
          className="flex-1 rounded border border-border px-2 py-1   bg-surface"
        >
          <option value="">Elegir producto…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.sku})
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0.001}
          step="0.001"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-20 rounded border border-border px-2 py-1   bg-surface"
        />
        <button type="submit" className="rounded bg-accent px-3 text-white  ">
          Agregar
        </button>
      </form>
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </section>
  );
}
