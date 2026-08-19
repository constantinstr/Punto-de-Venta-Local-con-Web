"use client";

import Link from "next/link";
import { PremiumBadge } from "@/components/common/PremiumBadge";

export type IntegrationState = "active" | "inactive" | "unconfigured";

const STATE_LABEL: Record<IntegrationState, string> = {
  active: "Activa",
  inactive: "Pausada",
  unconfigured: "Sin configurar",
};

const STATE_STYLE: Record<IntegrationState, string> = {
  active: "bg-success-muted text-success",
  inactive: "bg-warning-muted text-warning",
  unconfigured: "bg-surface-muted text-muted",
};

// Tarjeta de una integración en el hub de Configuración.
//
// El interruptor y el link son cosas distintas a propósito: pausar una
// integración NO borra las credenciales, solo la suspende — que es lo que se
// quiere cuando una tienda online está en mantenimiento. Configurar es entrar.
export function IntegrationCard({
  name,
  description,
  href,
  state,
  onToggle,
  toggleDisabled,
  toggleHint,
  premiumLocked,
}: {
  name: string;
  description: string;
  href: string;
  state: IntegrationState;
  onToggle?: (next: boolean) => void;
  toggleDisabled?: boolean;
  toggleHint?: string;
  // Cuando está seteado, fuerza toggleDisabled (aunque no venga toggleHint
  // propio) y muestra el cartel Premium — reusa el mismo affordance de
  // "interruptor deshabilitado con explicación" que ya tenía este
  // componente, en vez de agregar un layout aparte para el caso demo.
  premiumLocked?: boolean;
}) {
  const isOn = state === "active";
  const disabled = premiumLocked || toggleDisabled;
  const hint = premiumLocked
    ? "Disponible en el plan pago"
    : toggleHint;

  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-lg border p-4 ${
        premiumLocked
          ? "border-border bg-surface-muted grayscale-[0.6]"
          : "border-border bg-surface"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href}
            className={`font-medium hover:underline ${premiumLocked ? "text-muted" : "text-foreground"}`}
          >
            {name}
          </Link>
          <span className={`rounded px-2 py-0.5 text-xs ${STATE_STYLE[state]}`}>
            {STATE_LABEL[state]}
          </span>
          {/* No lleva grayscale (viene de un padre con grayscale-[0.6]) — el
              badge es justo lo único que TIENE que seguir llamando la
              atención en una tarjeta apagada. */}
          {premiumLocked && (
            <span className="[filter:grayscale(0)]">
              <PremiumBadge />
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">{description}</p>
        <Link href={href} className="mt-2 inline-block text-sm underline">
          {state === "unconfigured" ? "Configurar" : "Ver configuración"}
        </Link>
      </div>

      {onToggle && (
        <label className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted">
          <span className="flex items-center gap-2">
            <span>{isOn ? "Activa" : "Pausada"}</span>
            <input
              type="checkbox"
              checked={isOn}
              disabled={disabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="h-4 w-4 disabled:opacity-40"
              aria-label={`Activar ${name}`}
            />
          </span>
          {disabled && hint && (
            <span className="max-w-[11rem] text-right">{hint}</span>
          )}
        </label>
      )}
    </div>
  );
}
