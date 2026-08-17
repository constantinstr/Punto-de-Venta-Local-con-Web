"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  subscribeToTheme,
  type ThemePreference,
} from "@/lib/theme";

// useSyncExternalStore y no useState+useEffect: el tema vive fuera de React
// (localStorage y el atributo del <html>). El snapshot del servidor es
// "auto" porque el servidor no puede saber qué eligió esta terminal — el
// valor visual correcto ya lo aplicó el script inline de layout.tsx antes del
// primer pintado, así que el usuario nunca ve la diferencia.
export function useTheme() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    readStoredTheme,
    () => "auto" as ThemePreference,
  );

  const setTheme = useCallback((next: ThemePreference) => {
    applyTheme(next);
    storeTheme(next); // notifica a los suscriptores
  }, []);

  return { theme, setTheme };
}
