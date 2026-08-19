"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AuthUser, AuthTokens } from "@pos/shared-types";
import { apiPost, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [form, setForm] = useState({
    tenantName: "",
    storeName: "",
    ownerFullName: "",
    ownerEmail: "",
    ownerPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Gate de frontend nomás — /terminos y /privacidad siguen siendo
  // placeholder explícitamente no vinculante (ver el aviso en esas mismas
  // páginas). Cuando haya texto legal real revisado tiene sentido loguear
  // esta aceptación server-side; hasta entonces no vale la pena el campo.
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiPost<{ user: AuthUser; tokens: AuthTokens }>("/auth/register-tenant", form);
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
        <h1 className="text-xl font-semibold text-foreground  ">Registrá tu comercio</h1>

        <Field label="Nombre del comercio" value={form.tenantName} onChange={update("tenantName")} />
        <Field label="Nombre del primer local" value={form.storeName} onChange={update("storeName")} />
        <Field label="Tu nombre completo" value={form.ownerFullName} onChange={update("ownerFullName")} />
        <Field label="Email" type="email" value={form.ownerEmail} onChange={update("ownerEmail")} />
        <Field label="Contraseña (mín. 8 caracteres)" type="password" value={form.ownerPassword} onChange={update("ownerPassword")} />

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Acepto los{" "}
            <Link href="/terminos" target="_blank" className="underline">
              Términos y Condiciones
            </Link>{" "}
            y la{" "}
            <Link href="/privacidad" target="_blank" className="underline">
              Política de Privacidad
            </Link>
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !acceptedTerms}
          className="w-full rounded bg-accent py-2 text-sm font-medium text-white disabled:opacity-50  "
        >
          {loading ? "Creando cuenta…" : "Crear cuenta"}
        </button>

        <p className="text-center text-sm text-muted">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="underline">
            Iniciá sesión
          </Link>
        </p>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type={type}
        required
        value={value}
        onChange={onChange}
        className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
      />
    </label>
  );
}
