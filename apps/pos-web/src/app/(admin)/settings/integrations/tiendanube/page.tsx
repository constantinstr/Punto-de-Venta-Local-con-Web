"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TiendanubeConfig } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores } from "@/hooks/useCatalog";
import {
  useTiendanubeConfig,
  useUpdateTiendanubeConfig,
  useTiendanubeAuthorizeUrl,
  useTestTiendanubeConnection,
  useSyncTiendanubeCatalog,
  useRegisterTiendanubeWebhooks,
} from "@/hooks/useTiendanube";
import { usePlan } from "@/hooks/usePlan";
import { ApiError } from "@/lib/api";
import { PremiumLockedNotice } from "@/components/common/PremiumLockedNotice";

// El callback de OAuth vuelve al front con uno de estos en el query string —
// se traducen acá para no mostrarle un código al comerciante.
const CALLBACK_ERRORS: Record<string, string> = {
  faltan_parametros:
    "Tienda Nube no devolvió los datos de la autorización. Probá conectar de nuevo.",
  autorizacion_vencida:
    "La autorización tardó demasiado y venció. Volvé a empezar desde “Conectar”.",
  autorizacion_invalida:
    "La autorización no era válida. Volvé a empezar desde “Conectar”.",
  no_se_pudo_conectar:
    "No se pudo completar la conexión con Tienda Nube. Revisá que la aplicación siga instalada e intentá de nuevo.",
};

export default function TiendanubeSettingsPage() {
  // useSearchParams obliga a un límite de Suspense: sin esto el build de
  // producción falla (ver docs de Next, missing-suspense-with-csr-bailout).
  return (
    <Suspense
      fallback={<p className="p-8 text-sm text-muted">Cargando…</p>}
    >
      <TiendanubeSettings />
    </Suspense>
  );
}

function TiendanubeSettings() {
  const user = useRequireAuth();
  const { data: stores } = useStores();
  const searchParams = useSearchParams();
  const [storeId, setStoreId] = useState("");
  const { data: config, isLoading } = useTiendanubeConfig(storeId || undefined);
  const { can } = usePlan();
  const locked = !can("TIENDANUBE_SYNC");

  const callbackError = searchParams.get("error");
  const justConnected = searchParams.get("conectado") === "1";

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8 font-sans">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Integración Tienda Nube
        </h1>
        <p className="mt-1 text-sm text-muted">
          Sincronización de stock en los dos sentidos y de precios hacia la
          tienda, entre este local y tu Tienda Nube.
        </p>
      </div>

      {locked && (
        <PremiumLockedNotice>
          La sincronización con Tienda Nube es parte del plan pago. Podés ver
          cómo se conecta, pero completar la autorización está deshabilitado
          en la demo.
        </PremiumLockedNotice>
      )}

      {callbackError && (
        <p className="rounded border border-danger bg-danger-muted px-4 py-3 text-sm text-danger">
          {CALLBACK_ERRORS[callbackError] ??
            "No se pudo conectar con Tienda Nube."}
        </p>
      )}
      {justConnected && (
        <p className="rounded border border-success bg-success-muted px-4 py-3 text-sm text-success">
          Tienda conectada. Elegí el local de abajo para revisar la
          configuración y sincronizar el catálogo.
        </p>
      )}

      <select
        value={storeId}
        onChange={(e) => setStoreId(e.target.value)}
        className="rounded border border-border bg-surface px-3 py-2 text-sm"
      >
        <option value="">Elegí un local…</option>
        {stores?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {!storeId && (
        <p className="text-sm text-muted">
          La conexión es por local: cada uno se vincula a su propia Tienda Nube.
        </p>
      )}
      {storeId && isLoading && <p className="text-sm text-muted">Cargando…</p>}
      {storeId && !isLoading && !config && (
        <NotConnected storeId={storeId} locked={locked} />
      )}
      {storeId && config && <Connected storeId={storeId} config={config} />}
    </div>
  );
}

function NotConnected({ storeId, locked }: { storeId: string; locked: boolean }) {
  const authorize = useTiendanubeAuthorizeUrl();
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setError(null);
    try {
      const { url } = await authorize.mutateAsync(storeId);
      // Navegación de nivel superior a propósito: Tienda Nube muestra su
      // propia pantalla de permisos y no permite que se la embeba.
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo iniciar la conexión con Tienda Nube.",
      );
    }
  }

  return (
    <section className="space-y-4 rounded border border-border bg-surface p-6">
      <h2 className="text-lg font-medium text-foreground">
        Este local todavía no está conectado
      </h2>
      <p className="text-sm text-muted">
        Al conectar te vamos a llevar a Tienda Nube para que autorices el
        acceso. No hace falta cargar ninguna clave a mano: la autorización va y
        vuelve sola.
      </p>
      <p className="text-sm text-muted">
        Necesitás ser el dueño de la tienda en Tienda Nube (o tener permiso
        para instalar aplicaciones) para completar el paso.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={handleConnect}
        disabled={authorize.isPending || locked}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {authorize.isPending ? "Abriendo…" : "Conectar con Tienda Nube"}
      </button>
    </section>
  );
}

function Connected({
  storeId,
  config,
}: {
  storeId: string;
  config: TiendanubeConfig;
}) {
  const update = useUpdateTiendanubeConfig(config.id);
  const test = useTestTiendanubeConnection();
  const syncCatalog = useSyncTiendanubeCatalog();
  const registerWebhooks = useRegisterTiendanubeWebhooks();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<string>) {
    return async () => {
      setMessage(null);
      setError(null);
      try {
        setMessage(await action());
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "La operación falló.",
        );
      }
    };
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">
              Tienda conectada
            </h2>
            <p className="mt-1 text-sm text-muted">
              Tienda Nube nº {config.tnStoreId}
              {config.lastSyncAt
                ? ` · última sincronización ${new Date(config.lastSyncAt).toLocaleString("es-AR")}`
                : " · todavía sin sincronizar"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              config.isActive
                ? "bg-success-muted text-success"
                : "bg-surface-muted text-muted"
            }`}
          >
            {config.isActive ? "Activa" : "Pausada"}
          </span>
        </div>

        {/* Apagar la integración NO borra la autorización: la suspende. Es lo
            que se quiere cuando la tienda online está en mantenimiento. */}
        <Toggle
          label="Integración activa"
          hint="Apagarla suspende la sincronización sin perder la conexión."
          checked={config.isActive}
          onChange={(v) => update.mutate({ isActive: v })}
        />
        <Toggle
          label="Enviar stock a Tienda Nube"
          hint="Cada venta, ajuste o compra actualiza el stock en la tienda."
          checked={config.syncStockOutbound}
          onChange={(v) => update.mutate({ syncStockOutbound: v })}
        />
        <Toggle
          label="Descontar stock por pedidos web"
          hint="Cuando se paga un pedido en la tienda, se descuenta de este local."
          checked={config.syncStockInbound}
          onChange={(v) => update.mutate({ syncStockInbound: v })}
        />
        <Toggle
          label="Enviar precios a Tienda Nube"
          hint="Al cambiar un precio en el POS se actualiza también en la tienda."
          checked={config.syncPriceOutbound}
          onChange={(v) => update.mutate({ syncPriceOutbound: v })}
        />
      </section>

      <section className="space-y-3 rounded border border-border bg-surface p-6">
        <h2 className="text-lg font-medium text-foreground">Acciones</h2>
        <p className="text-sm text-muted">
          La vinculación del catálogo se hace por SKU: se atan los productos que
          ya existen de los dos lados. No se crean ni se modifican productos.
        </p>

        {message && <p className="text-sm text-success">{message}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={test.isPending}
            onClick={run(async () => {
              const r = await test.mutateAsync(storeId);
              return `Conexión correcta${r.storeName ? ` con “${r.storeName}”` : ""}.`;
            })}
            className="rounded border border-border px-4 py-2 text-sm disabled:opacity-50"
          >
            {test.isPending ? "Probando…" : "Probar conexión"}
          </button>

          <button
            type="button"
            disabled={syncCatalog.isPending}
            onClick={run(async () => {
              const r = await syncCatalog.mutateAsync(storeId);
              return `Catálogo revisado: ${r.revisados} variante(s) en la tienda, ${r.vinculados} vinculada(s) por SKU, ${r.sinCoincidencia} producto(s) del POS sin equivalente.`;
            })}
            className="rounded border border-border px-4 py-2 text-sm disabled:opacity-50"
          >
            {syncCatalog.isPending ? "Sincronizando…" : "Vincular catálogo"}
          </button>

          <button
            type="button"
            disabled={registerWebhooks.isPending}
            onClick={run(async () => {
              const r = await registerWebhooks.mutateAsync(storeId);
              if (r.error) throw new Error(r.error);
              return r.registered.length > 0
                ? `Avisos registrados: ${r.registered.join(", ")}.`
                : "Los avisos de pedidos ya estaban registrados.";
            })}
            className="rounded border border-border px-4 py-2 text-sm disabled:opacity-50"
          >
            {registerWebhooks.isPending
              ? "Registrando…"
              : "Re-registrar avisos de pedidos"}
          </button>
        </div>

        <p className="text-xs text-muted">
          Los avisos de pedidos se registran solos al conectar. Este botón sirve
          si cambió la dirección pública del servidor o si Tienda Nube no estaba
          disponible en ese momento.
        </p>
      </section>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--accent)]"
      />
      <span>
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
