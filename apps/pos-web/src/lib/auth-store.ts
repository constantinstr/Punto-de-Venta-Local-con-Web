import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser, AuthTokens } from "@pos/shared-types";

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  // La rehidratación de zustand `persist` desde localStorage es asíncrona
  // (corre en un efecto post-mount, no durante el render SSR) — sin esto,
  // useRequireAuth ve `user: null` en el primer render del cliente (antes
  // de que persist termine de leer localStorage) y expulsa al login a un
  // usuario que en realidad sigue logueado. Ver onRehydrateStorage abajo.
  hasHydrated: boolean;
  setSession: (user: AuthUser, tokens: AuthTokens) => void;
  logout: () => void;
  setHasHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      hasHydrated: false,
      setSession: (user, tokens) => set({ user, tokens }),
      logout: () => set({ user: null, tokens: null }),
      setHasHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: "pos-auth",
      onRehydrateStorage: () => (state) => state?.setHasHydrated(),
      // hasHydrated no se persiste — cada carga de página arranca en false
      // hasta que persist termine de leer localStorage.
      partialize: (state) => ({ user: state.user, tokens: state.tokens }),
    },
  ),
);
