import { describe, expect, it } from "vitest";
import { sumMovements, computeExpectedCash, computeDifference, classifyDifference } from "./cash-calculations";

describe("sumMovements", () => {
  it("suma ingresos y egresos por separado", () => {
    const { totalInflows, totalOutflows } = sumMovements([
      { type: "INFLOW", amount: 500 },
      { type: "OUTFLOW", amount: 200 },
      { type: "INFLOW", amount: 100 },
    ]);
    expect(totalInflows).toBe(600);
    expect(totalOutflows).toBe(200);
  });

  it("devuelve ceros para una lista vacía", () => {
    expect(sumMovements([])).toEqual({ totalInflows: 0, totalOutflows: 0 });
  });
});

describe("computeExpectedCash", () => {
  it("fondo inicial + ingresos - egresos", () => {
    expect(computeExpectedCash(1000, 500, 200)).toBe(1300);
  });

  it("incluye ventas en efectivo cuando se pasan (Sprint 5)", () => {
    expect(computeExpectedCash(1000, 0, 0, 300)).toBe(1300);
  });
});

describe("computeDifference / classifyDifference", () => {
  it("faltante: contado menor al esperado", () => {
    const diff = computeDifference(1250, 1300);
    expect(diff).toBe(-50);
    expect(classifyDifference(diff)).toBe("SHORTAGE");
  });

  it("sobrante: contado mayor al esperado", () => {
    const diff = computeDifference(1350, 1300);
    expect(diff).toBe(50);
    expect(classifyDifference(diff)).toBe("SURPLUS");
  });

  it("exacto: sin diferencia", () => {
    expect(classifyDifference(computeDifference(1300, 1300))).toBe("EXACT");
  });

  it("tolera diferencias de redondeo por debajo del centavo", () => {
    expect(classifyDifference(0.004)).toBe("EXACT");
    expect(classifyDifference(-0.004)).toBe("EXACT");
  });
});
