"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PremiumBadge } from "./PremiumBadge";

// Mismo patrón hand-rolled que CheckoutModal/QuoteModal (fixed inset-0 z-50 +
// click en el fondo cierra + Escape cierra) — no existía un <Modal> genérico
// antes de esto, así que se replica el patrón en vez de inventar uno nuevo a
// mitad de una feature.
export function UpgradeModal({
  reason,
  onClose,
}: {
  reason: string;
  onClose: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-lg bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <PremiumBadge />
          <h2 className="text-lg font-medium text-foreground">Función del plan pago</h2>
        </div>

        <p className="text-sm text-muted">{reason}</p>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border py-2 text-sm"
          >
            Seguir probando
          </button>
          <button
            type="button"
            onClick={() => router.push("/register")}
            className="rounded bg-accent py-2 text-sm font-medium text-accent-foreground"
          >
            Registrar mi comercio
          </button>
        </div>
      </div>
    </div>
  );
}
