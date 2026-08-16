// Paleta validada (ver skill dataviz / references/palette.md) — orden fijo,
// nunca se reordena por dataset. slot 1 (blue) también es el hue secuencial
// para series únicas (evolución de ventas).
export const CATEGORICAL_LIGHT = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
];
export const CATEGORICAL_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

export const SEQUENTIAL_LIGHT = "#2a78d6"; // slot 1 blue
export const SEQUENTIAL_DARK = "#3987e5";

export const STATUS = {
  good: { light: "#0ca30c", dark: "#0ca30c" },
  critical: { light: "#d03b3b", dark: "#e66767" },
};

export const CHROME = {
  gridline: { light: "#e1e0d9", dark: "#2c2c2a" },
  axis: { light: "#c3c2b7", dark: "#383835" },
  mutedText: { light: "#898781", dark: "#898781" },
  surface: { light: "#fcfcfb", dark: "#1a1a19" },
};

export function categoricalPalette(isDark: boolean): string[] {
  return isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
}

export function sequentialColor(isDark: boolean): string {
  return isDark ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT;
}
