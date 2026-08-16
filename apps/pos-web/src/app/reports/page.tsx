"use client";

import { useMemo, useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores } from "@/hooks/useCatalog";
import { useSalesSummary, usePaymentMethods, useTopProducts, useCashShiftsHistory } from "@/hooks/useReports";
import { resolvePreset, PRESET_LABELS, type DateRangePreset, type DateRange } from "@/lib/date-range-presets";
import { downloadFile, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/report-formatters";
import { SalesEvolutionChart } from "@/components/reports/SalesEvolutionChart";
import { PaymentMethodsChart } from "@/components/reports/PaymentMethodsChart";
import { TopProductsTable } from "@/components/reports/TopProductsTable";
import { CashShiftAuditTab } from "@/components/reports/CashShiftAuditTab";

const PRESETS: DateRangePreset[] = ["today", "yesterday", "last7days", "thisMonth", "custom"];

export default function ReportsPage() {
  const user = useRequireAuth();
  const { data: stores } = useStores();
  const [storeId, setStoreId] = useState("");
  const [preset, setPreset] = useState<DateRangePreset>("today");
  const [customRange, setCustomRange] = useState<DateRange>(resolvePreset("today"));
  const [tab, setTab] = useState<"sales" | "audit">("sales");
  const [exportError, setExportError] = useState<string | null>(null);

  const range = useMemo(() => {
    const base = preset === "custom" ? customRange : resolvePreset(preset);
    return { ...base, storeId: storeId || undefined };
  }, [preset, customRange, storeId]);

  const canView = user?.role === "OWNER" || user?.role === "ADMIN";

  const summary = useSalesSummary(range, canView);
  const payments = usePaymentMethods(range, canView && tab === "sales");
  const topProducts = useTopProducts(range, 10, canView && tab === "sales");
  const shiftsHistory = useCashShiftsHistory(range, canView && tab === "audit");

  if (!user) return null;
  if (!canView) {
    return (
      <div className="mx-auto max-w-md p-8 text-center font-sans">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Acceso restringido</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Los reportes de negocio son visibles solo para dueños/as y administradores/as.
        </p>
      </div>
    );
  }

  async function handleExport(type: "sales" | "products" | "shifts") {
    setExportError(null);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, type });
      if (range.storeId) params.set("storeId", range.storeId);
      await downloadFile(`/reports/export/excel?${params}`, `reporte-${type}-${range.from}_${range.to}.xlsx`);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "No se pudo exportar el archivo");
    }
  }

  async function handleExportPdf() {
    setExportError(null);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (range.storeId) params.set("storeId", range.storeId);
      await downloadFile(`/reports/export/pdf?${params}`, `resumen-ejecutivo-${range.from}_${range.to}.pdf`);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "No se pudo exportar el PDF");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8 font-sans">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Reportes y métricas</h1>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-full px-3 py-1.5 ${
                preset === p
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customRange.from}
              onChange={(e) => setCustomRange((r) => ({ ...r, from: e.target.value }))}
              className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span className="text-zinc-400">—</span>
            <input
              type="date"
              value={customRange.to}
              onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value }))}
              className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        )}

        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Todos los locales</option>
          {stores?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-4 border-b border-zinc-200 text-sm dark:border-zinc-800">
        <button
          onClick={() => setTab("sales")}
          className={`border-b-2 pb-2 ${tab === "sales" ? "border-zinc-900 font-medium dark:border-zinc-100" : "border-transparent text-zinc-500"}`}
        >
          Ventas
        </button>
        <button
          onClick={() => setTab("audit")}
          className={`border-b-2 pb-2 ${tab === "audit" ? "border-zinc-900 font-medium dark:border-zinc-100" : "border-transparent text-zinc-500"}`}
        >
          Auditoría de cajas
        </button>
      </div>

      {exportError && <p className="text-sm text-red-600">{exportError}</p>}

      {tab === "sales" && (
        <div className="space-y-6">
          {summary.isLoading && <p className="text-sm text-zinc-400">Cargando…</p>}
          {summary.data && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard label="Total facturado" value={formatMoney(summary.data.grossRevenue)} />
                <KpiCard label="Tickets" value={String(summary.data.completedCount)} />
                <KpiCard label="Ticket promedio" value={formatMoney(summary.data.averageTicket)} />
                <KpiCard
                  label="Margen bruto estimado"
                  value={formatMoney(summary.data.grossMargin)}
                  negative={summary.data.grossMargin < 0}
                />
              </div>

              <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Evolución de ventas</h2>
                <SalesEvolutionChart data={summary.data.timeSeries} />
              </section>
            </>
          )}

          <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Medios de pago</h2>
            {payments.data && <PaymentMethodsChart breakdown={payments.data.breakdown} />}
          </section>

          <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Top 10 productos</h2>
              <button onClick={() => handleExport("products")} className="text-xs underline">
                Exportar Excel
              </button>
            </div>
            {topProducts.data && <TopProductsTable products={topProducts.data.products} />}
          </section>

          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => handleExport("sales")}
              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
            >
              Exportar ventas (Excel)
            </button>
            <button onClick={handleExportPdf} className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">
              Descargar resumen ejecutivo (PDF)
            </button>
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => handleExport("shifts")}
              className="rounded border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
            >
              Exportar historial (Excel)
            </button>
          </div>
          {shiftsHistory.isLoading && <p className="text-sm text-zinc-400">Cargando…</p>}
          {shiftsHistory.data && <CashShiftAuditTab shifts={shiftsHistory.data.shifts} />}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${negative ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-50"}`}>
        {value}
      </p>
    </div>
  );
}
