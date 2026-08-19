"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api";

export default function ResetPasswordPage() {
  // useSearchParams obliga a un límite de Suspense: sin esto el build de
  // producción falla (mismo motivo que la integración de Tiendanube).
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Cargando…</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      await apiPost("/auth/reset-password", { token, newPassword });
      router.push("/login?reset=ok");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con la API");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8 font-sans">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border p-6">
          <h1 className="text-xl font-semibold text-foreground">Enlace inválido</h1>
          <p className="text-sm text-muted">
            Este enlace no tiene el código necesario. Pedí uno nuevo desde{" "}
            <Link href="/olvide-password" className="underline">
              recuperar contraseña
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8 font-sans">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border p-6"
      >
        <h1 className="text-xl font-semibold text-foreground">Elegí una contraseña nueva</h1>

        <label className="block text-sm">
          Contraseña nueva (mín. 8 caracteres)
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-foreground"
          />
        </label>

        <label className="block text-sm">
          Repetila
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-foreground"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-accent py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Guardando…" : "Guardar y volver a entrar"}
        </button>
      </form>
    </div>
  );
}
