"use client";

import { useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores, useLowStock } from "@/hooks/useCatalog";
import { useSalesSummary } from "@/hooks/useReports";
import { resolvePreset } from "@/lib/date-range-presets";
import { formatMoney } from "@/lib/report-formatters";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";

const TODAY = resolvePreset("today");

export default function Home() {
  const user = useRequireAuth();
  const { data: stores } = useStores();
  const [storeId, setStoreId] = useState("");

  const canViewSales = user?.role === "OWNER" || user?.role === "ADMIN";
  const summary = useSalesSummary({ ...TODAY, storeId: storeId || undefined }, canViewSales);
  const lowStock = useLowStock(storeId || undefined);

  if (!user) return null;

  // El cajero entra a vender, no a mirar un dashboard — atajo directo.
  if (user.role === "CASHIER") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 font-sans">
        <p className="text-lg text-foreground">Hola, {user.fullName.split(" ")[0]}</p>
        <Link
          href="/pos"
          className="rounded bg-accent px-8 py-4 text-lg font-medium text-accent-foreground"
        >
          Ir a la caja
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8 font-sans">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Hola, {user.fullName.split(" ")[0]}</h1>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="rounded border border-border bg-surface px-3 py-1.5 text-sm"
        >
          <option value="">Todos los locales</option>
          {stores?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <SetupChecklist />

      <div className="grid grid-cols-3 gap-4">
        {canViewSales && (
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-medium text-muted">Ventas de hoy</h2>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {summary.data ? formatMoney(summary.data.grossRevenue) : "—"}
            </p>
            <p className="text-xs text-muted">
              {summary.data ? `${summary.data.completedCount} venta(s)` : "Cargando…"}
            </p>
          </section>
        )}

        <Link
          href="/stock"
          className="rounded-lg border border-border bg-surface p-4 transition hover:border-accent"
        >
          <h2 className="text-xs font-medium text-muted">Stock bajo</h2>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {storeId ? (lowStock.data?.length ?? "—") : "—"}
          </p>
          <p className="text-xs text-muted">{storeId ? "producto(s)" : "Elegí un local"}</p>
        </Link>

        <Link
          href="/pos"
          className="flex flex-col justify-center rounded-lg bg-accent p-4 text-accent-foreground transition hover:opacity-90"
        >
          <h2 className="text-sm font-medium">Punto de venta</h2>
          <p className="mt-1 text-xs opacity-90">Abrir el mostrador →</p>
        </Link>
      </div>

      <nav className="grid grid-cols-4 gap-3 text-sm">
        <Link href="/sales" className="rounded border border-border bg-surface p-3 text-center hover:border-accent">
          Ventas
        </Link>
        <Link href="/catalog" className="rounded border border-border bg-surface p-3 text-center hover:border-accent">
          Catálogo
        </Link>
        <Link href="/customers" className="rounded border border-border bg-surface p-3 text-center hover:border-accent">
          Clientes
        </Link>
        <Link href="/reports" className="rounded border border-border bg-surface p-3 text-center hover:border-accent">
          Reportes
        </Link>
      </nav>
    </div>
  );
}
