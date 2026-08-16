"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { PaymentMethodBreakdownEntry } from "@pos/shared-types";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";
import { categoricalPalette, CHROME } from "@/lib/chart-palette";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER } from "@/lib/payment-method-labels";
import { formatMoney, formatPercentage } from "@/lib/report-formatters";

// Dona + tabla: la tabla es la vista accesible que no depende de distinguir
// color (ver skill dataviz, "ship a table view"). Color asignado por orden
// fijo de medio de pago, nunca recalculado según qué esté presente en el
// período — un medio ausente simplemente no aparece, el resto no cambia de color.
export function PaymentMethodsChart({ breakdown }: { breakdown: PaymentMethodBreakdownEntry[] }) {
  const isDark = useIsDarkMode();
  const palette = categoricalPalette(isDark);
  const surface = isDark ? CHROME.surface.dark : CHROME.surface.light;
  const grid = isDark ? CHROME.gridline.dark : CHROME.gridline.light;

  const colorFor = (method: string) => {
    const idx = PAYMENT_METHOD_ORDER.indexOf(method as (typeof PAYMENT_METHOD_ORDER)[number]);
    return palette[idx >= 0 ? idx % palette.length : 0];
  };

  if (breakdown.length === 0) {
    return <p className="py-12 text-center text-sm text-zinc-400">Sin cobros en el período seleccionado.</p>;
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <ResponsiveContainer width="100%" height={220} className="sm:max-w-[220px]">
        <PieChart>
          <Pie data={breakdown} dataKey="total" nameKey="method" innerRadius={55} outerRadius={90} paddingAngle={2}>
            {breakdown.map((entry) => (
              <Cell key={entry.method} fill={colorFor(entry.method)} stroke={surface} strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }}
            formatter={(value, _name, item) => {
              const entry = (item as { payload: PaymentMethodBreakdownEntry }).payload;
              return [
                `${formatMoney(Number(value ?? 0))} (${formatPercentage(entry.percentage)})`,
                PAYMENT_METHOD_LABELS[entry.method] ?? entry.method,
              ];
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <th className="py-1.5"></th>
            <th className="py-1.5">Medio</th>
            <th className="py-1.5 text-right">Operaciones</th>
            <th className="py-1.5 text-right">Total</th>
            <th className="py-1.5 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((entry) => (
            <tr key={entry.method} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colorFor(entry.method) }}
                />
              </td>
              <td className="py-1.5">{PAYMENT_METHOD_LABELS[entry.method] ?? entry.method}</td>
              <td className="py-1.5 text-right">{entry.count}</td>
              <td className="py-1.5 text-right">{formatMoney(entry.total)}</td>
              <td className="py-1.5 text-right text-zinc-500">{formatPercentage(entry.percentage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
