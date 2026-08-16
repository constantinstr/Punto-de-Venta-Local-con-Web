import "@testing-library/jest-dom/vitest";

// Node 22+ ships su propio localStorage global (activo por defecto, sin
// --localstorage-file) — no implementa setItem/clear/etc sin ese flag, y en
// este entorno gana la carrera contra el localStorage real de jsdom (window
// termina apuntando al mismo objeto roto), así que cualquier test que use
// localStorage falla con "no es una función" aunque el código de la app
// esté bien. Se reemplaza acá por un polyfill en memoria mínimo pero
// completo — alcanza para lo que testea esta suite (get/set/remove/clear).
if (typeof localStorage === "undefined" || typeof localStorage.clear !== "function") {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length() {
      return this.store.size;
    }
    clear(): void {
      this.store.clear();
    }
    getItem(key: string): string | null {
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    key(index: number): string | null {
      return [...this.store.keys()][index] ?? null;
    }
    removeItem(key: string): void {
      this.store.delete(key);
    }
    setItem(key: string, value: string): void {
      this.store.set(key, String(value));
    }
  }

  const memoryStorage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, configurable: true });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", { value: memoryStorage, configurable: true });
  }
}
