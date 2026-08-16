"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { usePosCatalog, type CatalogProduct, type SellableUnit } from "@/hooks/usePosCatalog";
import { useCategories, useStores } from "@/hooks/useCatalog";
import { useCashRegisters, useCurrentShift } from "@/hooks/useCashShifts";
import { useCartStore } from "@/stores/useCartStore";
import { useCashSessionStore } from "@/stores/useCashSessionStore";
import { computeCartTotals, computeOrderItemsPayload, cartHasStockIssues } from "@/stores/cart-calculations";
import type { CartItem } from "@/stores/cart-types";
import { apiGet } from "@/lib/api";
import { playScanErrorBeep, playScanSuccessBeep } from "@/lib/beep";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { CartTable } from "@/components/pos/CartTable";
import { CartSummary } from "@/components/pos/CartSummary";
import { VariantSelectorModal } from "@/components/pos/VariantSelectorModal";
import { CheckoutModal } from "@/components/pos/CheckoutModal";
import { OpenShiftModal } from "@/components/pos/OpenShiftModal";
import { CashControlModal } from "@/components/pos/CashControlModal";
import type { PosSearchResult } from "@pos/shared-types";

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
}

export default function PosPage() {
  const user = useRequireAuth();
  const { data: stores } = useStores();
  const { data: categories } = useCategories();

  const storeId = useCartStore((s) => s.storeId);
  const currentStore = stores?.find((s) => s.id === storeId);
  const setStoreId = useCartStore((s) => s.setStoreId);
  const items = useCartStore((s) => s.items);
  const globalDiscount = useCartStore((s) => s.globalDiscount);
  const selectedLineId = useCartStore((s) => s.selectedLineId);
  const addItem = useCartStore((s) => s.addItem);
  const incrementQuantity = useCartStore((s) => s.incrementQuantity);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const setGlobalDiscount = useCartStore((s) => s.setGlobalDiscount);
  const selectLine = useCartStore((s) => s.selectLine);
  const clearCart = useCartStore((s) => s.clearCart);

  const catalog = usePosCatalog(storeId ?? undefined);

  const cashRegisterId = useCashSessionStore((s) => s.cashRegisterId);
  const setCashRegisterId = useCashSessionStore((s) => s.setCashRegisterId);
  const { data: cashRegisters } = useCashRegisters(storeId ?? undefined);
  const { data: currentShift, isLoading: loadingShift } = useCurrentShift(cashRegisterId ?? undefined);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [variantModalProduct, setVariantModalProduct] = useState<CatalogProduct | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cashControlOpen, setCashControlOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cambiar de local invalida la caja elegida (las cajas son por sucursal).
  useEffect(() => {
    if (cashRegisters && cashRegisterId && !cashRegisters.some((r) => r.id === cashRegisterId)) {
      setCashRegisterId(null);
    }
  }, [cashRegisters, cashRegisterId, setCashRegisterId]);

  const canOperate = Boolean(
    currentShift &&
      currentShift.status === "OPEN" &&
      (currentShift.userId === user?.id || ["MANAGER", "ADMIN", "OWNER"].includes(user?.role ?? "")),
  );

  // Reloj + estado de red de la barra superior.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Debounce del buscador manual (la grilla filtra sobre el catálogo ya
  // precargado, no vuelve a pegarle a la API en cada tecla).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!scanMessage) return;
    const t = setTimeout(() => setScanMessage(null), 2500);
    return () => clearTimeout(t);
  }, [scanMessage]);

  const totals = useMemo(() => computeCartTotals(items, globalDiscount), [items, globalDiscount]);
  const orderItemsPayload = useMemo(() => computeOrderItemsPayload(items, globalDiscount), [items, globalDiscount]);
  const hasStockIssues = useMemo(() => cartHasStockIssues(items), [items]);

  const filteredProducts = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return catalog.products.filter((p) => {
      if (categoryId && p.categoryId !== categoryId) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term);
    });
  }, [catalog.products, debouncedSearch, categoryId]);

  function unitToCartItem(unit: SellableUnit): Omit<CartItem, "lineId" | "quantity"> {
    return {
      productId: unit.productId,
      variantId: unit.variantId,
      name: unit.name,
      attributesLabel: unit.attributes ? Object.values(unit.attributes).join(" / ") : undefined,
      sku: unit.sku,
      barcode: unit.barcode,
      unitPrice: unit.price,
      vatCondition: unit.vatCondition,
      stockAvailable: unit.stockAvailable,
      isUnlimitedStock: unit.isUnlimitedStock,
      isBundle: unit.productType === "BUNDLE",
    };
  }

  function handleSelectProduct(product: CatalogProduct) {
    if (product.hasVariants) {
      setVariantModalProduct(product);
      return;
    }
    const unit = catalog.units.find((u) => u.productId === product.id && !u.variantId);
    if (unit) addItem(unitToCartItem(unit));
  }

  function handleSelectVariant(unit: SellableUnit) {
    addItem(unitToCartItem(unit));
    setVariantModalProduct(null);
  }

  async function handleScan(code: string) {
    if (!storeId) {
      playScanErrorBeep();
      setScanMessage("Elegí un local antes de escanear.");
      return;
    }

    const localMatch = catalog.findByBarcode(code);
    if (localMatch) {
      addItem(unitToCartItem(localMatch));
      playScanSuccessBeep();
      return;
    }

    // No estaba en el catálogo precargado (recién creado, o todavía no
    // sincronizó) — fallback a la búsqueda exacta del backend.
    try {
      const results = await apiGet<PosSearchResult[]>(
        `/products/pos-search?q=${encodeURIComponent(code)}&storeId=${storeId}`,
      );
      const exact = results.length === 1 && results[0].barcode === code ? results[0] : undefined;
      if (!exact) {
        playScanErrorBeep();
        setScanMessage(`Código no encontrado: ${code}`);
        return;
      }
      addItem({
        productId: exact.productId,
        variantId: exact.variantId,
        name: exact.name,
        attributesLabel: exact.attributes ? Object.values(exact.attributes).join(" / ") : undefined,
        sku: exact.sku,
        barcode: exact.barcode,
        unitPrice: exact.price,
        vatCondition: exact.vatCondition,
        stockAvailable: exact.availableStock,
        isUnlimitedStock: exact.isUnlimitedStock,
        isBundle: exact.productType === "BUNDLE",
      });
      playScanSuccessBeep();
    } catch {
      playScanErrorBeep();
      setScanMessage("No se pudo consultar el código (¿sin conexión?)");
    }
  }

  useBarcodeScanner({ onScan: (code) => void handleScan(code), enabled: Boolean(storeId) });

  // Atajos de teclado — F2/F4/F9/Espacio/Esc siempre activos; +/-/Supr solo
  // cuando el foco no está en un campo de texto (para no pisar el tipeo).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === "F4") {
        e.preventDefault();
        if (items.length === 0) return;
        if (window.confirm("¿Vaciar el carrito actual?")) clearCart();
        return;
      }

      if ((e.key === " " || e.key === "F9") && !isEditableElement(e.target)) {
        e.preventDefault();
        if (canOperate && items.length > 0 && !hasStockIssues) setCheckoutOpen(true);
        return;
      }

      if (e.key === "Escape") {
        if (checkoutOpen || variantModalProduct) return; // los modales manejan su propio Esc
        if (isEditableElement(document.activeElement)) (document.activeElement as HTMLElement).blur();
        return;
      }

      if (!selectedLineId || isEditableElement(e.target)) return;

      if (e.key === "+") {
        e.preventDefault();
        incrementQuantity(selectedLineId, 1);
      } else if (e.key === "-") {
        e.preventDefault();
        incrementQuantity(selectedLineId, -1);
      } else if (e.key === "Delete") {
        e.preventDefault();
        removeItem(selectedLineId);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    items.length,
    hasStockIssues,
    canOperate,
    selectedLineId,
    checkoutOpen,
    variantModalProduct,
    clearCart,
    incrementQuantity,
    removeItem,
  ]);

  if (!user) return null;

  return (
    <div className="flex h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
        <div className="flex items-center gap-4">
          <select
            value={storeId ?? ""}
            onChange={(e) => setStoreId(e.target.value || null)}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Elegí un local…</option>
            {stores?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {storeId && (
            <select
              value={cashRegisterId ?? ""}
              onChange={(e) => setCashRegisterId(e.target.value || null)}
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Elegí una caja…</option>
              {cashRegisters?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}

          {currentShift && currentShift.status === "OPEN" && (
            <button
              type="button"
              onClick={() => setCashControlOpen(true)}
              className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-700 dark:bg-green-950 dark:text-green-300"
            >
              {currentShift.cashRegister.name} · {currentShift.user.fullName} — Control de caja
            </button>
          )}

          <span className="text-zinc-400">{user.fullName}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className={online ? "text-green-600" : "text-red-600"}>{online ? "● Online" : "● Offline"}</span>
          <span className="font-mono tabular-nums">{now.toLocaleTimeString("es-AR")}</span>
        </div>
      </header>

      {!storeId ? (
        <div className="flex flex-1 items-center justify-center text-zinc-400">
          Elegí un local en la barra superior para empezar a vender.
        </div>
      ) : !cashRegisterId ? (
        <div className="flex flex-1 items-center justify-center text-zinc-400">
          Elegí una caja en la barra superior para empezar a vender.
        </div>
      ) : loadingShift ? (
        <div className="flex flex-1 items-center justify-center text-zinc-400">Consultando el estado de la caja…</div>
      ) : !currentShift ? (
        <OpenShiftModal
          cashRegister={cashRegisters!.find((r) => r.id === cashRegisterId)!}
          onOpened={() => undefined}
        />
      ) : !canOperate ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-zinc-400">
          Esta caja la tiene abierta {currentShift.user.fullName}. Pedile a un encargado que la cierre, o elegí otra
          caja.
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <section className="flex w-3/5 flex-col gap-3 overflow-hidden p-4">
            <div className="flex items-center gap-2">
              <input
                ref={searchInputRef}
                data-no-scan
                placeholder="Buscar por nombre o SKU… (F2)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryId(null)}
                className={`rounded-full px-3 py-1 text-xs ${
                  categoryId === null
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 dark:border-zinc-700"
                }`}
              >
                Todas
              </button>
              {categories?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    categoryId === c.id
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {scanMessage && <p className="text-sm text-amber-600">{scanMessage}</p>}

            <div className="flex-1 overflow-y-auto">
              <ProductGrid products={filteredProducts} onSelect={handleSelectProduct} />
            </div>
          </section>

          <section className="flex w-2/5 flex-col border-l border-zinc-200 p-4 dark:border-zinc-800">
            <CartTable
              items={items}
              selectedLineId={selectedLineId}
              onSelectLine={selectLine}
              onIncrement={incrementQuantity}
              onSetQuantity={setQuantity}
              onRemove={removeItem}
            />
            <CartSummary
              totals={totals}
              globalDiscount={globalDiscount}
              onSetGlobalDiscount={setGlobalDiscount}
              onCheckout={() => setCheckoutOpen(true)}
              checkoutDisabled={!canOperate || items.length === 0 || hasStockIssues}
            />
          </section>
        </div>
      )}

      {variantModalProduct && (
        <VariantSelectorModal
          product={variantModalProduct}
          onSelect={handleSelectVariant}
          onClose={() => setVariantModalProduct(null)}
        />
      )}

      {checkoutOpen && currentShift && storeId && currentStore && (
        <CheckoutModal
          totals={totals}
          orderItemsPayload={orderItemsPayload}
          storeId={storeId}
          store={currentStore}
          cashShiftId={currentShift.id}
          onNewSale={() => {
            clearCart();
            setCheckoutOpen(false);
            searchInputRef.current?.focus();
          }}
          onClose={() => setCheckoutOpen(false)}
        />
      )}

      {cashControlOpen && currentShift && (
        <CashControlModal
          shift={currentShift}
          onClose={() => setCashControlOpen(false)}
          onClosed={() => setCashControlOpen(false)}
        />
      )}
    </div>
  );
}
