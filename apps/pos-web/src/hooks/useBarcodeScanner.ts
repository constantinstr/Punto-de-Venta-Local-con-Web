import { useEffect, useRef } from "react";

interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  minLength?: number;
  maxKeyDelayMs?: number;
  bufferResetMs?: number;
  enabled?: boolean;
}

// Lector de código de barras USB/Bluetooth (modo teclado). Ver docs/peripherals.md §1
// para el detalle de por qué se usa un listener global en vez de un input dedicado.
export function useBarcodeScanner({
  onScan,
  minLength = 6,
  maxKeyDelayMs = 40,
  bufferResetMs = 200,
  enabled = true,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!enabled) return;

    function resetBuffer() {
      bufferRef.current = "";
    }

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-no-scan]")) return;

      const now = performance.now();
      const delta = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (delta > maxKeyDelayMs && bufferRef.current.length > 0) {
        resetBuffer();
      }

      if (e.key === "Enter") {
        const code = bufferRef.current;
        resetBuffer();
        if (code.length >= minLength) {
          e.preventDefault();
          onScan(code);
        }
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }

      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetBuffer, bufferResetMs);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      clearTimeout(resetTimerRef.current);
    };
  }, [enabled, minLength, maxKeyDelayMs, bufferResetMs, onScan]);
}
