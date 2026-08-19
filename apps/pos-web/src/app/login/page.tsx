"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { AuthUser, AuthTokens } from "@pos/shared-types";
import { apiPost, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export default function LoginPage() {
  // useSearchParams (para el mensaje de "contraseña cambiada") obliga a un
  // límite de Suspense: sin esto el build de producción falla.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "ok";
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiPost<{ user: AuthUser; tokens: AuthTokens }>("/auth/login", { email, password });
      setSession(result.user, result.tokens);
      router.push("/inicio");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con la API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8 font-sans bg-background">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border p-6  "
      >
        <h1 className="text-xl font-semibold text-foreground  ">Iniciar sesión</h1>

        {justReset && (
          <p className="rounded bg-accent-muted px-3 py-2 text-sm text-accent">
            Contraseña actualizada. Ya podés iniciar sesión con la nueva.
          </p>
        )}

        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
          />
        </label>

        <label className="block text-sm">
          Contraseña
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-accent py-2 text-sm font-medium text-white disabled:opacity-50  "
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>

        <p className="text-center text-sm text-muted">
          <Link href="/olvide-password" className="underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>

        <p className="text-center text-sm text-muted">
          ¿Todavía no tenés cuenta?{" "}
          <Link href="/register" className="underline">
            Registrá tu comercio
          </Link>
        </p>
      </form>
    </div>
  );
}
