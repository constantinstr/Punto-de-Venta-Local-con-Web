import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface CashSessionState {
  cashRegisterId: string | null;
  setCashRegisterId: (id: string | null) => void;
}

// Separado de useCartStore a propósito: la caja elegida sobrevive a que se
// vacíe el carrito o se cobre una venta — solo cambia si el cajero elige
// otra terminal explícitamente.
export const useCashSessionStore = create<CashSessionState>()(
  persist(
    (set) => ({
      cashRegisterId: null,
      setCashRegisterId: (id) => set({ cashRegisterId: id }),
    }),
    { name: "pos-cash-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
