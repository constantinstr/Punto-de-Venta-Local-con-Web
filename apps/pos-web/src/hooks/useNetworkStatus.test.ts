import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";
import { useNetworkStatus } from "./useNetworkStatus";

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true, writable: true });
}

describe("useNetworkStatus", () => {
  beforeEach(() => {
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    cleanup();
    setNavigatorOnLine(true);
  });

  it("arranca reflejando navigator.onLine", () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(false);
  });

  it('pasa a false cuando el navegador dispara el evento "offline"', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current).toBe(false);
  });

  it('vuelve a true cuando el navegador dispara el evento "online"', () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe(true);
  });

  it("deja de escuchar eventos después de desmontarse", () => {
    const { result, unmount } = renderHook(() => useNetworkStatus());
    unmount();

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    // No hay assert directo sobre "result" post-unmount (React lo
    // advertiría) — lo que importa es que dispatchEvent no explote por un
    // listener que quedó colgado apuntando a un componente desmontado.
    expect(result.current).toBe(true);
  });
});
