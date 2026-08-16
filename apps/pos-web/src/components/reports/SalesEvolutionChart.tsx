"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";
import { CHROME, sequentialColor } from "@/lib/chart-palette";
import { formatMoney } from "@/lib/report-formatters";

interface Point {
  date: string;
  grossRevenue: number;
  ticketCount: number;
}

function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

// Serie única (facturación por día): sin leyenda — el título ya la nombra
// (ver skill dataviz, regla de leyenda para 1 serie). Un solo eje: nunca
// dos escalas para facturación vs. tickets en el mismo gráfico.
export function SalesEvolutionChart({ data }: { data: Point[] }) {
  const isDark = useIsDarkMode();
  const color = sequentialColor(isDark);
  const grid = isDark ? CHROME.gridline.dark : CHROME.gridline.light;
  const axis = isDark ? CHROME.mutedText.dark : CHROME.mutedText.light;
  const surface = isDark ? CHROME.surface.dark : CHROME.surface.light;

  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-zinc-400">Sin ventas en el período seleccionado.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={grid} strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDayLabel}
          tick={{ fill: axis, fontSize: 11 }}
          axisLine={{ stroke: grid }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatMoney}
          tick={{ fill: axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip
          contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v) => formatDayLabel(String(v))}
          formatter={(value, name) => [
            name === "grossRevenue" ? formatMoney(Number(value ?? 0)) : String(value ?? 0),
            name === "grossRevenue" ? "Facturación" : "Tickets",
          ]}
        />
        <Line
          type="monotone"
          dataKey="grossRevenue"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
