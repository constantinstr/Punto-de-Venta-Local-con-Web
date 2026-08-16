// Réplica en el cliente de la fórmula que ya calcula el backend
// (CashShiftsService.computeSummary), usada solo para feedback instantáneo
// mientras el cajero tipea el conteo de cierre — el backend sigue siendo la
// fuente de verdad: el cálculo real se rehace server-side al cerrar.

export interface MovementLike {
  type: "INFLOW" | "OUTFLOW";
  amount: number;
}

export function sumMovements(movements: MovementLike[]): { totalInflows: number; totalOutflows: number } {
  let totalInflows = 0;
  let totalOutflows = 0;
  for (const m of movements) {
    if (m.type === "INFLOW") totalInflows += m.amount;
    else totalOutflows += m.amount;
  }
  return { totalInflows, totalOutflows };
}

export function computeExpectedCash(
  initialAmount: number,
  totalInflows: number,
  totalOutflows: number,
  cashSalesTotal = 0,
): number {
  return initialAmount + totalInflows - totalOutflows + cashSalesTotal;
}

export function computeDifference(actualCash: number, expectedCash: number): number {
  return actualCash - expectedCash;
}

export type DifferenceKind = "EXACT" | "SURPLUS" | "SHORTAGE";

// Tolerancia de un centavo para redondeos de punto flotante — una
// diferencia de $0.001 no debería marcarse como "faltante".
export function classifyDifference(difference: number, tolerance = 0.01): DifferenceKind {
  if (Math.abs(difference) <= tolerance) return "EXACT";
  return difference > 0 ? "SURPLUS" : "SHORTAGE";
}
