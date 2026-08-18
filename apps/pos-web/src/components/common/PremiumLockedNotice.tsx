"use client";

import { PremiumBadge } from "./PremiumBadge";

// Aviso compacto para la parte de arriba de una pantalla de integración
// cuando el tenant es demo: el formulario se deja visible pero inerte —
// ver el intercambio de diseño en las 3 páginas de integraciones. Mostrar
// "qué hace el producto pago" es justamente el punto de una demo.
export function PremiumLockedNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-accent-muted bg-accent-muted p-3 text-sm text-accent">
      <PremiumBadge />
      <p>{children}</p>
    </div>
  );
}
