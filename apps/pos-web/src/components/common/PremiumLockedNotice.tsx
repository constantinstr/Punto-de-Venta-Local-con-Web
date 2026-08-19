"use client";

import { useState } from "react";
import { PremiumBadge } from "./PremiumBadge";
import { PremiumContactForm } from "./PremiumContactForm";

// Aviso compacto para la parte de arriba de una pantalla de integración
// cuando el tenant es demo: el formulario se deja visible pero inerte —
// ver el intercambio de diseño en las 3 páginas de integraciones. Mostrar
// "qué hace el producto pago" es justamente el punto de una demo.
//
// Lleva su propio CTA (antes era solo texto informativo, sin forma de
// actuar sobre el aviso salvo yendo a buscar el widget flotante).
// `children` es un string simple (no ReactNode general) a propósito: se
// reusa tal cual como `context` del formulario de contacto sin arriesgar un
// "[object Object]" si algún día alguien le pasa JSX en vez de texto.
export function PremiumLockedNotice({ children }: { children: string }) {
  const [showContact, setShowContact] = useState(false);

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-accent-muted bg-accent-muted p-3 text-sm text-accent">
      <div className="flex items-start gap-2">
        <PremiumBadge />
        <p>{children}</p>
      </div>
      <button
        type="button"
        onClick={() => setShowContact(true)}
        className="shrink-0 rounded border border-accent px-3 py-1 text-xs font-medium underline-offset-2 hover:underline"
      >
        Quiero pasar a Premium
      </button>

      {showContact && (
        <PremiumContactForm context={children} onClose={() => setShowContact(false)} />
      )}
    </div>
  );
}
