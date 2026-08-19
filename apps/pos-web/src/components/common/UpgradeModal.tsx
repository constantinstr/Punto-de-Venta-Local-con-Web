"use client";

import { useEffect, useState } from "react";
import { PremiumBadge } from "./PremiumBadge";
import { PremiumContactForm } from "./PremiumContactForm";

// Mismo patrón hand-rolled que CheckoutModal/QuoteModal (fixed inset-0 z-50 +
// click en el fondo cierra + Escape cierra) — no existía un <Modal> genérico
// antes de esto, así que se replica el patrón en vez de inventar uno nuevo a
// mitad de una feature.
//
// El CTA ya no manda a /register: la demo conserva el mismo comercio al
// pagar (ver SubscriptionService.convertDemoIfPaid), así que "empezar de
// cero" dejó de tener sentido — el botón abre PremiumContactForm en su
// lugar.
export function UpgradeModal({
  reason,
  onClose,
}: {
  reason: string;
  onClose: () => void;
}) {
  const [showContact, setShowContact] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (showContact) {
    return <PremiumContactForm context={reason} onClose={onClose} />;
  }

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
            onClick={() => setShowContact(true)}
            className="rounded bg-accent py-2 text-sm font-medium text-accent-foreground"
          >
            Quiero pasar a Premium
          </button>
        </div>
      </div>
    </div>
  );
}
