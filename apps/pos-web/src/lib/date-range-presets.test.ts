import { describe, it, expect, vi, afterEach } from "vitest";
import { resolvePreset } from "./date-range-presets";

// new Date(year, monthIndex, day, hour) construye en hora LOCAL (no UTC) —
// a propósito, para que el test valga sin importar en qué timezone corra
// (ver el fix de toDateStr en date-range-presets.ts: calendario local, no UTC).
describe("resolvePreset", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('"today" devuelve la misma fecha para from y to', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 16, 15, 30));
    expect(resolvePreset("today")).toEqual({ from: "2026-08-16", to: "2026-08-16" });
  });

  it('"yesterday" devuelve el día calendario anterior', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 16, 15, 30));
    expect(resolvePreset("yesterday")).toEqual({ from: "2026-08-15", to: "2026-08-15" });
  });

  it('"last7days" arranca 6 días antes de hoy (7 días inclusive)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 16, 15, 30));
    expect(resolvePreset("last7days")).toEqual({ from: "2026-08-10", to: "2026-08-16" });
  });

  it('"thisMonth" arranca el día 1 del mes en curso', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 16, 15, 30));
    expect(resolvePreset("thisMonth")).toEqual({ from: "2026-08-01", to: "2026-08-16" });
  });

  it("cambiar de preset cambia el rango calculado (no queda pegado al anterior)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 16, 15, 30));
    const today = resolvePreset("today");
    const thisMonth = resolvePreset("thisMonth");
    expect(today).not.toEqual(thisMonth);
  });

  it('"yesterday" cruza correctamente el borde de mes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 1, 10, 0)); // 1° de septiembre
    expect(resolvePreset("yesterday")).toEqual({ from: "2026-08-31", to: "2026-08-31" });
  });

  it('cerca de medianoche no "salta" al día siguiente (regresión del bug UTC vs. hora local)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 16, 23, 45)); // 23:45 hora local
    expect(resolvePreset("today")).toEqual({ from: "2026-08-16", to: "2026-08-16" });
  });
});
