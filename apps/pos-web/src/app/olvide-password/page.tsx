"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api";

// Un solo campo (email) y, pase lo que pase, el mismo mensaje genérico —
// nunca hay que confirmar ni desmentir si un email está registrado (ver el
// comentario de AuthService.forgotPassword en el backend, que aplica el
// mismo criterio del lado del servidor).
export default function OlvidePasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiPost("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con la API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8 font-sans">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border p-6">
        <h1 className="text-xl font-semibold text-foreground">Recuperar contraseña</h1>

        {sent ? (
          <p className="text-sm text-foreground">
            Si <strong>{email}</strong> está registrado, te llega un correo con instrucciones para
            elegir una contraseña nueva. Revisá también la carpeta de spam.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-foreground"
              />
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-accent py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Enviando…" : "Mandar instrucciones"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-muted">
          <Link href="/login" className="underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
