"use client";

import { useState } from "react";
import { NO_DISCOUNT_LIMIT } from "@pos/shared-types";
import type { UserRole } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  useDiscountPolicies,
  useSetDiscountPolicy,
} from "@/hooks/useDiscountPolicy";
import { ApiError } from "@/lib/api";

// Los roles que atienden el mostrador. SUPERADMIN no aparece: es staff del
// SaaS, no opera la caja de ningún comercio.
const ROLE_LABELS: Record<string, { label: string; hint: string }> = {
  CASHIER: { label: "Cajero", hint: "Atiende el mostrador." },
  MANAGER: { label: "Encargado", hint: "Responsable del local." },
  ADMIN: { label: "Administrador", hint: "Administra el comercio." },
  OWNER: { label: "Dueño", hint: "Vos." },
};

function describeLimit(maxPercent: number): string {
  if (maxPercent >= NO_DISCOUNT_LIMIT) return "Sin tope";
  if (maxPercent === 0) return "No puede descontar";
  return `Hasta ${maxPercent}%`;
}

export default function DiscountsSettingsPage() {
  const user = useRequireAuth();
  const { data: policies, isLoading } = useDiscountPolicies();

  if (!user) return null;

  const canEdit = user.role === "OWNER" || user.role === "ADMIN";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8 font-sans">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Topes de descuento
        </h1>
        <p className="mt-1 text-sm text-muted">
          Cuánto puede descontar cada rol en una venta, sobre el precio de cada
          producto y sobre el total.
        </p>
      </div>

      <p className="rounded border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
        Los valores marcados como <em>por defecto</em> son los que trae el
        sistema: el cajero no descuenta y el encargado resuelve hasta 10% sin
        consultar. Cambiá el que quieras — el límite se controla también del
        lado del servidor, así que no se puede saltear desde el navegador.
      </p>

      {isLoading && <p className="text-sm text-muted">Cargando…</p>}

      {!isLoading && (
        <div className="divide-y divide-border rounded-lg border border-border bg-surface">
          {policies?.map((p) => (
            <RoleRow
              key={p.role}
              role={p.role}
              label={ROLE_LABELS[p.role]?.label ?? p.role}
              hint={ROLE_LABELS[p.role]?.hint ?? ""}
              maxPercent={p.maxPercent}
              isDefault={p.isDefault}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}

      {!canEdit && (
        <p className="text-sm text-muted">
          Solo el dueño o un administrador pueden cambiar estos topes.
        </p>
      )}
    </div>
  );
}

function RoleRow({
  role,
  label,
  hint,
  maxPercent,
  isDefault,
  canEdit,
}: {
  role: UserRole;
  label: string;
  hint: string;
  maxPercent: number;
  isDefault: boolean;
  canEdit: boolean;
}) {
  const save = useSetDiscountPolicy();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(maxPercent));
  const [error, setError] = useState<string | null>(null);

  async function persist(next: number | null) {
    setError(null);
    try {
      await save.mutateAsync({ role, maxPercent: next });
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo guardar el tope.",
      );
    }
  }

  const sinTope = maxPercent >= NO_DISCOUNT_LIMIT;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-20 rounded border border-border bg-surface px-2 py-1 text-right text-sm"
          />
          <span className="text-sm text-muted">%</span>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() =>
              void persist(
                value === ""
                  ? null
                  : Math.min(100, Math.max(0, Number(value))),
              )
            }
            className="rounded bg-accent px-3 py-1 text-sm text-accent-foreground disabled:opacity-50"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(String(maxPercent));
              setEditing(false);
            }}
            className="text-sm text-muted underline"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm ${
              sinTope
                ? "bg-warning-muted text-warning"
                : "bg-success-muted text-success"
            }`}
          >
            {describeLimit(maxPercent)}
          </span>
          {isDefault && (
            <span className="text-xs text-muted">(por defecto)</span>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm text-accent underline"
              >
                Cambiar
              </button>
              {/* Solo aparece si el comercio se apartó del default: si no,
                  "restaurar" no haría nada y sería un botón muerto. */}
              {!isDefault && (
                <button
                  type="button"
                  onClick={() => void persist(null)}
                  className="text-sm text-muted underline"
                >
                  Restaurar
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
