"use client";

import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useTheme } from "@/hooks/useTheme";
import { THEME_LABELS, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; help: string }[] = [
  { value: "light", help: "Fondo claro. Es lo que mejor se lee en un mostrador con luz." },
  { value: "dark", help: "Fondo oscuro. Cansa menos la vista en locales con poca luz." },
  { value: "auto", help: "Sigue la configuración de esta computadora." },
];

export default function AppearancePage() {
  const user = useRequireAuth();
  const { theme, setTheme } = useTheme();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link href="/settings" className="text-sm text-muted underline">
        ← Configuración
      </Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold text-foreground">Apariencia</h1>
      <p className="mb-6 text-sm text-muted">
        La elección queda guardada en esta computadora, no en tu cuenta: la PC del
        mostrador y la de la oficina pueden usar temas distintos.
      </p>

      <fieldset className="space-y-2">
        <legend className="sr-only">Tema de la aplicación</legend>
        {OPTIONS.map((option) => {
          const selected = theme === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                selected
                  ? "border-accent bg-accent-muted"
                  : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={selected}
                onChange={() => setTheme(option.value)}
                className="mt-1"
              />
              <span>
                <span className="block font-medium text-foreground">
                  {THEME_LABELS[option.value]}
                </span>
                <span className="block text-sm text-muted">{option.help}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <section className="mt-8 rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-foreground">Vista previa</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
            Acción principal
          </button>
          <button className="rounded border border-border px-4 py-2 text-sm text-foreground">
            Acción secundaria
          </button>
          <span className="rounded bg-success-muted px-2 py-1 text-xs text-success">
            Completada
          </span>
          <span className="rounded bg-danger-muted px-2 py-1 text-xs text-danger">
            Anulada
          </span>
          <span className="rounded bg-warning-muted px-2 py-1 text-xs text-warning">
            Stock bajo
          </span>
        </div>
        <p className="mt-3 text-sm text-muted">
          Texto secundario, como el que acompaña a los datos en las tablas.
        </p>
      </section>
    </div>
  );
}
