"use client";

import { useSyncExternalStore } from "react";
import { resolveIsDark, subscribeToTheme } from "@/lib/theme";

// Los gráficos (Recharts) pintan SVG con colores literales por props, así que
// no pueden resolverse con clases de Tailwind: este hook les da el mismo
// booleano que gobierna el resto de la UI.
//
// Lee el tema EFECTIVO, no `prefers-color-scheme` a secas: desde que hay
// selector manual, el SO ya no es la única fuente. Sin esto, un usuario con
// Windows en oscuro que elige "Claro" vería toda la app clara pero los
// gráficos con la paleta oscura.
export function useIsDarkMode(): boolean {
  return useSyncExternalStore(
    subscribeToTheme,
    resolveIsDark,
    () => false, // en el servidor se asume claro, que es el default
  );
}
