// Preferencia de tema de ESTA terminal, no del usuario: la PC del mostrador y
// la notebook del dueño pueden querer temas distintos aunque entren con la
// misma cuenta. Por eso vive en localStorage y no en el perfil del usuario.
export const THEME_STORAGE_KEY = "pos-theme";

export type ThemePreference = "light" | "dark" | "auto";

export const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Claro",
  dark: "Oscuro",
  auto: "Automático",
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "auto";
}

// "auto" QUITA el atributo en vez de ponerle un valor: sin atributo manda el
// @media prefers-color-scheme de globals.css, que es justamente lo que
// significa "automático". Ver el comentario del bloque de tres estados ahí.
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "auto") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }
}

export function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "auto";
  } catch {
    // localStorage puede estar bloqueado (modo privado, kiosco).
    return "auto";
  }
}

export function storeTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Si no se puede guardar, el tema igual se aplica en esta sesión.
  }
  notify();
}

// ── Store mínimo para useSyncExternalStore ──────────────────────────────────
//
// El tema vive fuera de React (localStorage + el atributo del <html>), así que
// los hooks lo leen con useSyncExternalStore en vez de copiarlo a un useState
// dentro de un efecto: esa copia produce un render extra en cada montaje y
// puede quedar desincronizada entre dos componentes que lean lo mismo.
//
// El evento `storage` del navegador solo avisa a las OTRAS pestañas, nunca a
// la que hizo el cambio — por eso hace falta este emisor propio además.

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeToTheme(listener: Listener): () => void {
  listeners.add(listener);

  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) listener();
  };
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  window.addEventListener("storage", onStorage);
  // También hay que reaccionar al SO: con la preferencia en "automático", que
  // Windows pase a modo oscuro tiene que repintar los gráficos.
  media.addEventListener("change", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", listener);
  };
}

/** Si el tema EFECTIVO es oscuro, ya sea por elección o por el SO. */
export function resolveIsDark(): boolean {
  const preference = readStoredTheme();
  if (preference === "dark") return true;
  if (preference === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
