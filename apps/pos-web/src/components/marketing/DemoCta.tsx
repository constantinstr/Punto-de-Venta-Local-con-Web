"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRequestDemoCode, useVerifyDemoCode } from "@/hooks/useDemo";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api";

// Único fragmento cliente de la landing: aísla useMutation/useAuthStore para
// que el resto de la página (pitch, features, precios) pueda ser estático
// sin arrastrar todo a "use client" — ver el comentario del plan sobre esto.
//
// Dos pasos (email → código de 6 dígitos), no un botón directo: exige un
// email real antes de darle acceso, para frenar el spam de cuentas —
// decisión de producto. El código llega al mail (best-effort, ver
// MailerService); sin SMTP configurado, se loguea en el server para poder
// probar el flujo en dev.
export function DemoCta() {
  const router = useRouter();
  const requestCode = useRequestDemoCode();
  const verifyCode = useVerifyDemoCode();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Espera a la rehidratación antes de decidir qué botón mostrar — mismo
  // motivo que useRequireAuth, pero al revés: acá el default (mostrar
  // "Probar demo") es correcto para el 99% de los visitantes anónimos, así
  // que no hay pantalla en blanco mientras se espera: se muestra la CTA de
  // siempre y, si resulta que había sesión, se reemplaza un instante después.
  const alreadyLoggedIn = hasHydrated && Boolean(user);

  function friendlyError(err: unknown, fallback: string): string {
    if (err instanceof ApiError && err.status === 429) {
      return "Demasiados intentos. Probá de nuevo en un rato.";
    }
    if (err instanceof ApiError) return err.message;
    return fallback;
  }

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await requestCode.mutateAsync(email);
      setStep("code");
    } catch (err) {
      setError(friendlyError(err, "No se pudo enviar el código."));
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await verifyCode.mutateAsync({ email, code });
      router.push("/inicio");
    } catch (err) {
      setError(friendlyError(err, "No se pudo iniciar la demo."));
    }
  }

  if (alreadyLoggedIn) {
    return (
      <Link
        href="/inicio"
        className="rounded bg-accent px-8 py-4 text-lg font-medium text-accent-foreground"
      >
        Ir a mi panel
      </Link>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={(e) => void handleVerifyCode(e)} className="flex flex-col items-center gap-3">
        <p className="text-sm text-foreground">
          Te mandamos un código a <strong>{email}</strong>
        </p>
        <input
          required
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          placeholder="Código de 6 dígitos"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-48 rounded border border-border bg-surface px-4 py-3 text-center text-lg tracking-[0.3em] text-foreground"
        />
        <button
          type="submit"
          disabled={verifyCode.isPending || code.length !== 6}
          className="rounded bg-accent px-8 py-3 text-lg font-medium text-accent-foreground disabled:opacity-50"
        >
          {verifyCode.isPending ? "Verificando…" : "Entrar a la demo"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode("");
            setError(null);
          }}
          className="text-xs text-muted underline"
        >
          Usar otro email / pedir código de nuevo
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void handleRequestCode(e)} className="flex flex-col items-center gap-3">
      <div className="flex w-full max-w-sm flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row">
        <input
          required
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-border bg-surface px-4 py-3 text-sm text-foreground sm:w-64"
        />
        <button
          type="submit"
          disabled={requestCode.isPending}
          className="whitespace-nowrap rounded bg-accent px-6 py-3 text-lg font-medium text-accent-foreground disabled:opacity-50"
        >
          {requestCode.isPending ? "Enviando…" : "Probar gratis"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Te mandamos un código para confirmar tu email. Sin tarjeta — se bloquea a los 7 días.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
