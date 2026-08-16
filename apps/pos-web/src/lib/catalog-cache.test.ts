import { describe, expect, it, beforeEach, vi } from "vitest";
import { saveCatalogSnapshot, loadCatalogSnapshot } from "./catalog-cache";
import type { Product, StockRow } from "@pos/shared-types";

const PRODUCT: Product = {
  id: "p1",
  categoryId: null,
  category: null,
  sku: "SKU-1",
  barcode: "123",
  name: "Producto Test",
  description: null,
  type: "SIMPLE",
  costPrice: "10",
  price: "20",
  vatCondition: "IVA_21",
  trackStock: true,
  isActive: true,
  variants: [],
  wooProductId: null,
  wooSyncStatus: "IGNORED",
};

const STOCK_ROW: StockRow = {
  productId: "p1",
  variantId: null,
  name: "Producto Test",
  sku: "SKU-1",
  attributes: null,
  quantity: 5,
  minAlertStock: null,
  isUnlimitedStock: false,
};

beforeEach(() => {
  localStorage.clear();
});

describe("saveCatalogSnapshot / loadCatalogSnapshot", () => {
  it("guarda y recupera un snapshot para un local", () => {
    saveCatalogSnapshot("store-1", [PRODUCT], [STOCK_ROW]);
    const snapshot = loadCatalogSnapshot("store-1");

    expect(snapshot?.products).toEqual([PRODUCT]);
    expect(snapshot?.stockRows).toEqual([STOCK_ROW]);
    expect(snapshot?.cachedAt).toBeDefined();
  });

  it("devuelve null si no hay snapshot guardado para ese local", () => {
    expect(loadCatalogSnapshot("store-inexistente")).toBeNull();
  });

  it("mantiene snapshots separados por local", () => {
    saveCatalogSnapshot("store-1", [PRODUCT], [STOCK_ROW]);
    saveCatalogSnapshot("store-2", [], []);

    expect(loadCatalogSnapshot("store-1")?.products).toHaveLength(1);
    expect(loadCatalogSnapshot("store-2")?.products).toHaveLength(0);
  });

  it("un snapshot nuevo pisa al anterior del mismo local", () => {
    saveCatalogSnapshot("store-1", [PRODUCT], [STOCK_ROW]);
    saveCatalogSnapshot("store-1", [], []);

    expect(loadCatalogSnapshot("store-1")?.products).toHaveLength(0);
  });

  it("se degrada a null en vez de lanzar si el JSON guardado está corrupto", () => {
    localStorage.setItem("pos-catalog-cache:store-1", "{esto no es json válido");
    expect(loadCatalogSnapshot("store-1")).toBeNull();
  });

  it("save() no lanza aunque localStorage falle (ej. cuota superada)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => saveCatalogSnapshot("store-1", [PRODUCT], [STOCK_ROW])).not.toThrow();

    spy.mockRestore();
  });
});
