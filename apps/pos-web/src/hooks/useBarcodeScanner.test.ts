import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useBarcodeScanner } from "./useBarcodeScanner";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pressKey(key: string, target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
}

// Simula un lector HID: todos los caracteres llegan prácticamente juntos.
async function fastScan(code: string, target: EventTarget = window) {
  for (const char of code) {
    pressKey(char, target);
  }
  pressKey("Enter", target);
}

// Simula tipeo humano: intervalos > maxKeyDelayMs entre teclas.
async function slowType(code: string, delayMs: number, target: EventTarget = window) {
  for (const char of code) {
    pressKey(char, target);
    await sleep(delayMs);
  }
  pressKey("Enter", target);
}

describe("useBarcodeScanner", () => {
  it("detecta un escaneo rápido terminado en Enter", async () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 6 }));

    await fastScan("7790895000123");

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("7790895000123");
  });

  it("ignora tipeo humano lento, incluso si termina en Enter", async () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 6, maxKeyDelayMs: 30 }));

    await slowType("123456", 60);

    expect(onScan).not.toHaveBeenCalled();
  });

  it("descarta códigos más cortos que minLength aunque el escaneo sea rápido", async () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 6 }));

    await fastScan("123");

    expect(onScan).not.toHaveBeenCalled();
  });

  it("no intercepta cuando el foco está en un elemento marcado data-no-scan", async () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 6 }));

    const input = document.createElement("input");
    input.setAttribute("data-no-scan", "");
    document.body.appendChild(input);

    await fastScan("7790895000123", input);

    expect(onScan).not.toHaveBeenCalled();
  });

  it("no agrega el listener cuando enabled=false", async () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 6, enabled: false }));

    await fastScan("7790895000123");

    expect(onScan).not.toHaveBeenCalled();
  });

  it("limpia el listener al desmontar", async () => {
    const onScan = vi.fn();
    const { unmount } = renderHook(() => useBarcodeScanner({ onScan, minLength: 6 }));
    unmount();

    await fastScan("7790895000123");

    expect(onScan).not.toHaveBeenCalled();
  });
});
