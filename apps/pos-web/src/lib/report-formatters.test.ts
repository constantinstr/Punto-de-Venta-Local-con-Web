import { describe, it, expect } from "vitest";
import { formatMoney, formatPercentage } from "./report-formatters";

describe("formatMoney", () => {
  it("antepone el signo pesos y usa coma decimal (es-AR)", () => {
    expect(formatMoney(1234.5)).toBe("$1.234,50");
  });

  it("siempre muestra dos decimales, incluso en montos enteros", () => {
    expect(formatMoney(100)).toBe("$100,00");
  });

  it("formatea negativos (margen bruto negativo)", () => {
    expect(formatMoney(-500)).toBe("-$500,00");
  });

  it("formatea cero", () => {
    expect(formatMoney(0)).toBe("$0,00");
  });
});

describe("formatPercentage", () => {
  it("agrega el símbolo % con hasta un decimal", () => {
    expect(formatPercentage(25)).toBe("25%");
    expect(formatPercentage(33.33)).toBe("33,3%");
  });

  it("formatea 100% exacto", () => {
    expect(formatPercentage(100)).toBe("100%");
  });

  it("formatea cero", () => {
    expect(formatPercentage(0)).toBe("0%");
  });
});
