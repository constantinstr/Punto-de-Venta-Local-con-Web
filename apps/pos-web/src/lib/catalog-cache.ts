import type { Product, StockRow } from "@pos/shared-types";

export interface CatalogSnapshot {
  products: Product[];
  stockRows: StockRow[];
  cachedAt: string;
}

function storageKey(storeId: string): string {
  return `pos-catalog-cache:${storeId}`;
}

// localStorage (no IndexedDB): el catálogo de un comercio chico/mediano
// entra cómodo en el límite de ~5MB, y una API sincrónica es más simple de
// integrar en un hook que ya maneja varios estados (loading/error/offline)
// sin sumar otra capa async. Nunca debe poder romper el armado de carritos:
// cualquier falla (localStorage lleno, modo privado, JSON corrupto) se
// degrada en silencio a "no hay snapshot", no a una excepción.
export function saveCatalogSnapshot(storeId: string, products: Product[], stockRows: StockRow[]): void {
  try {
    const snapshot: CatalogSnapshot = { products, stockRows, cachedAt: new Date().toISOString() };
    localStorage.setItem(storageKey(storeId), JSON.stringify(snapshot));
  } catch {
    // best-effort — el POS sigue funcionando con datos en memoria igual.
  }
}

export function loadCatalogSnapshot(storeId: string): CatalogSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(storeId));
    if (!raw) return null;
    return JSON.parse(raw) as CatalogSnapshot;
  } catch {
    return null;
  }
}
