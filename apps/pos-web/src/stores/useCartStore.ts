import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem, Discount } from "./cart-types";
import { makeLineId } from "./cart-types";

interface CartState {
  storeId: string | null;
  items: CartItem[];
  globalDiscount?: Discount;
  selectedLineId: string | null;
  // Presupuesto del que nace este carrito, si se llegó acá vía "Convertir"
  // en /quotes/[id]. Viaja hasta CheckoutModal, que lo manda en POST /orders
  // para que el backend cierre el vínculo en la misma transacción de la venta.
  quoteId: string | null;

  setStoreId: (storeId: string | null) => void;
  setQuoteId: (quoteId: string | null) => void;
  addItem: (item: Omit<CartItem, "lineId" | "quantity"> & { quantity?: number }) => void;
  incrementQuantity: (lineId: string, delta: number) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  setLineDiscount: (lineId: string, discount: Discount | undefined) => void;
  setGlobalDiscount: (discount: Discount | undefined) => void;
  selectLine: (lineId: string | null) => void;
  clearCart: () => void;
}

// sessionStorage (no localStorage): el carrito sobrevive a un F5 accidental
// pero no queda pegado indefinidamente si se cierra la pestaña o cambia de
// turno de caja — coherente con "sesión de venta activa", no persistencia
// permanente (eso es CashShift, Sprint 4).
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      storeId: null,
      items: [],
      globalDiscount: undefined,
      selectedLineId: null,
      quoteId: null,

      setStoreId: (storeId) => {
        // Cambiar de local invalida el carrito: el stock disponible y los
        // precios pueden diferir entre sucursales.
        if (storeId !== get().storeId) {
          set({ storeId, items: [], globalDiscount: undefined, selectedLineId: null, quoteId: null });
        }
      },

      setQuoteId: (quoteId) => set({ quoteId }),

      addItem: (item) => {
        const lineId = makeLineId(item.productId, item.variantId);
        const existing = get().items.find((i) => i.lineId === lineId);
        const quantityToAdd = item.quantity ?? 1;

        if (existing) {
          set({
            items: get().items.map((i) =>
              i.lineId === lineId ? { ...i, quantity: i.quantity + quantityToAdd } : i,
            ),
            selectedLineId: lineId,
          });
          return;
        }

        set({
          items: [...get().items, { ...item, lineId, quantity: quantityToAdd }],
          selectedLineId: lineId,
        });
      },

      incrementQuantity: (lineId, delta) => {
        set({
          items: get()
            .items.map((i) => (i.lineId === lineId ? { ...i, quantity: i.quantity + delta } : i))
            .filter((i) => i.quantity > 0),
        });
      },

      setQuantity: (lineId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(lineId);
          return;
        }
        set({ items: get().items.map((i) => (i.lineId === lineId ? { ...i, quantity } : i)) });
      },

      removeItem: (lineId) => {
        set({
          items: get().items.filter((i) => i.lineId !== lineId),
          selectedLineId: get().selectedLineId === lineId ? null : get().selectedLineId,
        });
      },

      setLineDiscount: (lineId, discount) => {
        set({ items: get().items.map((i) => (i.lineId === lineId ? { ...i, discount } : i)) });
      },

      setGlobalDiscount: (discount) => set({ globalDiscount: discount }),

      selectLine: (lineId) => set({ selectedLineId: lineId }),

      clearCart: () => set({ items: [], globalDiscount: undefined, selectedLineId: null, quoteId: null }),
    }),
    {
      name: "pos-cart",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
