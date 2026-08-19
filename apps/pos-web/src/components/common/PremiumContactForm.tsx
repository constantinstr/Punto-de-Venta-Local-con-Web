"use client";

import { useEffect, useState } from "react";
import { useCreateSupportMessage } from "@/hooks/useSupport";
import { ApiError } from "@/lib/api";
import { PremiumBadge } from "./PremiumBadge";

// Separado a propósito de SupportWidget (que es el widget de soporte
// técnico general): más chico, sin categorías, contacto ya resuelto del
// usuario logueado — un solo textarea y enviar. Comparte el mismo endpoint
// (POST /support/messages) marcado category:"PREMIUM_INTEREST", así que en
// /platform/support-messages el dueño ve todo junto, filtrable por categoría.
export function PremiumContactForm({
  context,
  onClose,
}: {
  context?: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const createMessage = useCreateSupportMessage();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createMessage.mutateAsync({
        category: "PREMIUM_INTEREST",
        subject: context,
        message: message || context || "Quiero pasar a Premium.",
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje.");
    }
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
        {sent ? (
          <>
            <div className="flex items-center gap-2">
              <PremiumBadge />
              <h2 className="text-lg font-medium text-foreground">¡Gracias!</h2>
            </div>
            <p className="text-sm text-muted">
              Recibimos tu mensaje. Te contactamos para coordinar el pase a Premium
              sin perder lo que ya cargaste.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded bg-accent py-2 text-sm font-medium text-accent-foreground"
            >
              Cerrar
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2">
              <PremiumBadge />
              <h2 className="text-lg font-medium text-foreground">Quiero pasar a Premium</h2>
            </div>
            {context && <p className="text-sm text-muted">{context}</p>}

            <label className="block text-sm">
              Contanos lo que necesites (opcional)
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ej: quiero facturar y sincronizar con mi tienda online"
                className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onClose} className="rounded border border-border py-2 text-sm">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMessage.isPending}
                className="rounded bg-accent py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {createMessage.isPending ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
