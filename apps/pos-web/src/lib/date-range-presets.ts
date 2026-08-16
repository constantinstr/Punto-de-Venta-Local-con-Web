export type DateRangePreset = "today" | "yesterday" | "last7days" | "thisMonth" | "custom";

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
}

// Fecha de CALENDARIO LOCAL, no UTC — el resto de esta función arma el
// rango con getDate()/getMonth() (hora local), así que mezclar eso con
// toISOString() (UTC) corre el día ~3hs en zonas UTC-negativas (ej.
// Argentina, UTC-3): entre las 21:00 y la medianoche locales, UTC ya está
// en el día siguiente, y "Hoy" terminaría mostrando el rango de mañana.
function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolvePreset(preset: DateRangePreset): DateRange {
  const now = new Date();
  const today = toDateStr(now);

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: toDateStr(y), to: toDateStr(y) };
    }
    case "last7days": {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { from: toDateStr(start), to: today };
    }
    case "thisMonth": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toDateStr(start), to: today };
    }
    case "custom":
      return { from: today, to: today };
  }
}

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  last7days: "Últimos 7 días",
  thisMonth: "Este mes",
  custom: "Rango personalizado",
};
