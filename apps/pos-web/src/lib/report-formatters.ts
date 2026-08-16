// Formateo compartido entre los componentes de /reports — separado para
// poder testear el formato sin renderizar componentes (ver
// report-formatters.test.ts).
export function formatMoney(n: number): string {
  // Signo antes del "$" ("-$500,00", no "$-500,00") — más legible para
  // montos negativos (ej. margen bruto negativo).
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercentage(n: number): string {
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}
