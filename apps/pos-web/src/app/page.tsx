"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useApiHealth } from "@/hooks/useApiHealth";
import { useAuthStore } from "@/lib/auth-store";

export default function Home() {
  const { data: health, isLoading, isError } = useApiHealth();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const handleScan = useCallback((code: string) => {
    setLastScan(code);
  }, []);

  useBarcodeScanner({ onScan: handleScan });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-50 p-8 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        POS SaaS — Sprint 1
      </h1>

      <section className="w-full max-w-md rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-2 text-sm font-medium text-zinc-500">Sesión</h2>
        {user ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>
                {user.fullName} · <span className="text-zinc-500">{user.role}</span>
              </span>
              <button onClick={logout} className="underline">
                Salir
              </button>
            </div>
            <div className="flex gap-4">
              <Link href="/pos" className="underline">
                Punto de venta
              </Link>
              <Link href="/catalog" className="underline">
                Catálogo
              </Link>
              <Link href="/stock" className="underline">
                Stock
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 text-sm">
            <Link href="/login" className="underline">
              Iniciar sesión
            </Link>
            <Link href="/register" className="underline">
              Registrar comercio
            </Link>
          </div>
        )}
      </section>

      <section className="w-full max-w-md rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-2 text-sm font-medium text-zinc-500">Estado de la API</h2>
        {isLoading && <p className="text-zinc-400">Consultando /health…</p>}
        {isError && (
          <p className="text-red-600">
            No se pudo conectar a la API. ¿Está corriendo <code>pnpm dev</code> y los servicios locales?
          </p>
        )}
        {health && (
          <ul className="space-y-1 text-sm">
            <li>DB: {health.db ? "✅ conectada" : "❌ sin conexión"}</li>
            <li>Redis: {health.redis ? "✅ conectado" : "❌ sin conexión"}</li>
          </ul>
        )}
      </section>

      <section className="w-full max-w-md rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-2 text-sm font-medium text-zinc-500">
          Lector de código de barras
        </h2>
        <p className="text-sm text-zinc-400">
          Escaneá un código con el lector físico (o tipealo rápido y presioná Enter).
        </p>
        <p className="mt-2 font-mono text-lg text-zinc-900 dark:text-zinc-50">
          {lastScan ?? "—"}
        </p>
      </section>
    </div>
  );
}
