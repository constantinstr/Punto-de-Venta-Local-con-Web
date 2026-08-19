"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { useCreateSupportMessage } from "@/hooks/useSupport";
import { ApiError } from "@/lib/api";

// Montado UNA sola vez en providers.tsx (cubre landing + login/register +
// /pos + (admin)/* con un solo punto — ver la nota en ese archivo), y se
// auto-oculta si no hay sesión. Así "solo para usuarios logueados" no
// depende de tocar AppShell (que no cubre /pos) ni cada layout por separado.
//
// z-40, no z-50: los modales existentes (UpgradeModal, CheckoutModal, etc.)
// usan z-50 — este botón nunca debe taparlos.
export function SupportWidget() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Soporte"
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl text-accent-foreground shadow-lg hover:opacity-90"
      >
        ?
      </button>
      {open && <SupportPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function SupportPanel({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<"TECHNICAL" | "PREMIUM_INTEREST">("TECHNICAL");
  const [subject, setSubject] = useState("");
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
      await createMessage.mutateAsync({ category, subject: subject || undefined, message });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-end bg-background/40 p-4 sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-lg bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <>
            <h2 className="text-lg font-medium text-foreground">¡Listo!</h2>
            <p className="text-sm text-muted">
              Recibimos tu mensaje. Te contestamos a la brevedad.
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
            <h2 className="text-lg font-medium text-foreground">¿En qué te ayudamos?</h2>

            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => setCategory("TECHNICAL")}
                className={`flex-1 rounded border px-3 py-2 ${
                  category === "TECHNICAL" ? "border-accent bg-accent-muted text-accent" : "border-border text-foreground"
                }`}
              >
                Duda técnica
              </button>
              <button
                type="button"
                onClick={() => setCategory("PREMIUM_INTEREST")}
                className={`flex-1 rounded border px-3 py-2 ${
                  category === "PREMIUM_INTEREST" ? "border-accent bg-accent-muted text-accent" : "border-border text-foreground"
                }`}
              >
                Quiero pagar el plan
              </button>
            </div>

            <label className="block text-sm">
              Asunto (opcional)
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-sm">
              Mensaje
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
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
