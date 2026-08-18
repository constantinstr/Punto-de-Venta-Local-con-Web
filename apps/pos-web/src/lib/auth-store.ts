import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser, AuthTokens } from "@pos/shared-types";

interface DemoCredentials {
  email: string;
  password: string;
}

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  // No hay mailer en el repo — POST /demo/start devuelve la contraseña
  // generada en claro, una sola vez. Se persiste junto a la sesión (no solo
  // se muestra al crear la demo) para que "ver mis datos de acceso" en
  // DemoBanner siga funcionando después de un refresh. null para cualquier
  // sesión que no vino de /demo/start.
  demoCredentials: DemoCredentials | null;
  // La rehidratación de zustand `persist` desde localStorage es asíncrona
  // (corre en un efecto post-mount, no durante el render SSR) — sin esto,
  // useRequireAuth ve `user: null` en el primer render del cliente (antes
  // de que persist termine de leer localStorage) y expulsa al login a un
  // usuario que en realidad sigue logueado. Ver onRehydrateStorage abajo.
  hasHydrated: boolean;
  setSession: (user: AuthUser, tokens: AuthTokens, demoCredentials?: DemoCredentials) => void;
  logout: () => void;
  setHasHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      demoCredentials: null,
      hasHydrated: false,
      setSession: (user, tokens, demoCredentials) =>
        set({ user, tokens, demoCredentials: demoCredentials ?? null }),
      logout: () => set({ user: null, tokens: null, demoCredentials: null }),
      setHasHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: "pos-auth",
      onRehydrateStorage: () => (state) => state?.setHasHydrated(),
      // hasHydrated no se persiste — cada carga de página arranca en false
      // hasta que persist termine de leer localStorage.
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        demoCredentials: state.demoCredentials,
      }),
    },
  ),
);
