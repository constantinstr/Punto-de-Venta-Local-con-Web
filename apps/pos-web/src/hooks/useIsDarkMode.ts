import { useEffect, useState } from "react";

// El dark mode de esta app sigue el SO (@media prefers-color-scheme, ver
// globals.css) — no hay toggle manual. Los gráficos (Recharts) pintan SVG
// con colores literales via props, así que no pueden resolverse solo con
// clases Tailwind: este hook les da el mismo booleano que ya gobierna el
// resto de la UI. El estado inicial se lee en el initializer (no en un
// efecto) para no disparar un render en cascada solo por el valor de arranque.
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isDark;
}
