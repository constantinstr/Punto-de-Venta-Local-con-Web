"use client";

import { useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores } from "@/hooks/useCatalog";
import {
  useWooCommerceConfig,
  useCreateWooConfig,
  useUpdateWooConfig,
  useTestWooConnection,
  useSyncWooCatalog,
  useSyncLogs,
  useRetrySyncLog,
} from "@/hooks/useWooCommerce";
import { usePlan } from "@/hooks/usePlan";
import { ApiError } from "@/lib/api";
import { PremiumLockedNotice } from "@/components/common/PremiumLockedNotice";
import type { SyncLog, WooCommerceConfig } from "@pos/shared-types";

const DIRECTION_LABELS: Record<string, string> = {
  OUTBOUND_TO_WOO: "POS → WooCommerce",
  INBOUND_FROM_WOO: "WooCommerce → POS",
};
const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "text-green-700 dark:text-green-400",
  FAILED: "text-red-600 dark:text-red-400",
  PENDING: "text-muted",
};

export default function WooCommerceSettingsPage() {
  const user = useRequireAuth();
  const { data: stores } = useStores();
  const [storeId, setStoreId] = useState("");
  const { data: config, isLoading } = useWooCommerceConfig(storeId || undefined);
  const { can } = usePlan();
  const locked = !can("WOO_SYNC");

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8 font-sans">
      <div>
        <h1 className="text-2xl font-semibold text-foreground  ">Integración WooCommerce</h1>
        <p className="mt-1 text-sm text-muted">
          Sincronización bidireccional de stock, y de precio hacia la tienda, entre este local y tu tienda WooCommerce.
        </p>
      </div>

      {locked && (
        <PremiumLockedNotice>
          La sincronización con WooCommerce es parte del plan pago. Podés ver
          cómo se configura, pero guardar credenciales está deshabilitado en
          la demo.
        </PremiumLockedNotice>
      )}

      <select
        value={storeId}
        onChange={(e) => setStoreId(e.target.value)}
        className="rounded border border-border px-3 py-2 text-sm   bg-surface"
      >
        <option value="">Elegí un local…</option>
        {stores?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {!storeId && <p className="text-sm text-muted">Seleccioná el local que va a recibir el stock de la tienda online.</p>}
      {storeId && isLoading && <p className="text-sm text-muted">Cargando…</p>}

      {storeId && !isLoading && !config && <CreateConfigForm storeId={storeId} locked={locked} />}
      {storeId && !isLoading && config && <ConfigPanel storeId={storeId} config={config} />}

      {storeId && config && <SyncLogPanel />}
    </div>
  );
}

function CreateConfigForm({ storeId, locked }: { storeId: string; locked: boolean }) {
  const create = useCreateWooConfig();
  const [apiUrl, setApiUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ storeId, apiUrl, consumerKey, consumerSecret, webhookSecret });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la integración");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border p-4 text-sm  ">
      <h2 className="font-medium text-foreground  ">Este local todavía no tiene una integración configurada</h2>
      <label className="block">
        URL de la tienda
        <input
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder="https://mitienda.com"
          required
          className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
        />
      </label>
      <label className="block">
        Consumer Key
        <input
          value={consumerKey}
          onChange={(e) => setConsumerKey(e.target.value)}
          placeholder="ck_…"
          required
          className="mt-1 w-full rounded border border-border px-3 py-2 font-mono text-xs   bg-surface"
        />
      </label>
      <label className="block">
        Consumer Secret
        <input
          type="password"
          value={consumerSecret}
          onChange={(e) => setConsumerSecret(e.target.value)}
          placeholder="cs_…"
          required
          className="mt-1 w-full rounded border border-border px-3 py-2 font-mono text-xs   bg-surface"
        />
      </label>
      <label className="block">
        Webhook Secret
        <input
          type="password"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          minLength={8}
          required
          className="mt-1 w-full rounded border border-border px-3 py-2 font-mono text-xs   bg-surface"
        />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={create.isPending || locked}
        className="rounded bg-accent px-4 py-2 text-white disabled:opacity-50  "
      >
        Guardar integración
      </button>
    </form>
  );
}

function ConfigPanel({ storeId, config }: { storeId: string; config: WooCommerceConfig }) {
  const update = useUpdateWooConfig(config.id);
  const testConnection = useTestWooConnection();
  const syncCatalog = useSyncWooCatalog();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function handleTestConnection() {
    setTestResult(null);
    try {
      const res = await testConnection.mutateAsync(storeId);
      setTestResult(res.success ? "Conexión exitosa." : `Falló: ${res.message ?? "error desconocido"}`);
    } catch (err) {
      setTestResult(err instanceof ApiError ? err.message : "No se pudo probar la conexión");
    }
  }

  async function handleSyncCatalog() {
    setSyncResult(null);
    try {
      const summary = await syncCatalog.mutateAsync(storeId);
      setSyncResult(
        `Revisados ${summary.scanned} · emparejados ${summary.matched} · creados ${summary.created} · omitidos ${summary.skipped} · errores ${summary.errors}`,
      );
    } catch (err) {
      setSyncResult(err instanceof ApiError ? err.message : "No se pudo sincronizar el catálogo");
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4 text-sm  ">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground  ">{config.apiUrl}</p>
          <p className="text-xs text-muted">
            {config.isActive ? "Activa" : "Inactiva"} · Última sincronización:{" "}
            {config.lastSyncAt ? new Date(config.lastSyncAt).toLocaleString("es-AR") : "nunca"}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={config.isActive}
            onChange={(e) => update.mutate({ isActive: e.target.checked })}
          />
          Activa
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={config.syncStockOutbound}
            onChange={(e) => update.mutate({ syncStockOutbound: e.target.checked })}
          />
          Sincronizar ventas del local hacia la web
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={config.syncStockInbound}
            onChange={(e) => update.mutate({ syncStockInbound: e.target.checked })}
          />
          Descontar stock cuando venden en la web
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={config.syncPriceOutbound}
            onChange={(e) => update.mutate({ syncPriceOutbound: e.target.checked })}
          />
          Sincronizar precio del local hacia la web
        </label>
      </div>

      <label className="block text-xs">
        URL de webhook (pegar en WooCommerce → Configuración → Avanzado → Webhooks)
        <input
          readOnly
          value={config.webhookUrl}
          onFocus={(e) => e.target.select()}
          className="mt-1 w-full rounded border border-border px-3 py-2 font-mono text-xs bg-surface"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          onClick={handleTestConnection}
          disabled={testConnection.isPending}
          className="rounded border border-border px-3 py-1.5 disabled:opacity-50  "
        >
          {testConnection.isPending ? "Probando…" : "Probar conexión"}
        </button>
        <button
          onClick={handleSyncCatalog}
          disabled={syncCatalog.isPending}
          className="rounded bg-accent px-3 py-1.5 text-white disabled:opacity-50  "
        >
          {syncCatalog.isPending ? "Sincronizando catálogo…" : "Sincronizar catálogo ahora"}
        </button>
      </div>
      {testResult && <p className="text-xs text-muted">{testResult}</p>}
      {syncResult && <p className="text-xs text-muted">{syncResult}</p>}
    </div>
  );
}

function SyncLogPanel() {
  const { data: logs, isLoading } = useSyncLogs();
  const retry = useRetrySyncLog();

  return (
    <div>
      <h2 className="mb-3 text-lg font-medium text-foreground  ">Estado de sincronización</h2>
      {isLoading && <p className="text-sm text-muted">Cargando…</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted  ">
            <th className="py-2">Fecha</th>
            <th className="py-2">Tipo</th>
            <th className="py-2">Dirección</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {(logs ?? []).map((log: SyncLog) => (
            <tr key={log.id} className="border-b border-border  ">
              <td className="py-2 text-xs text-muted">{new Date(log.createdAt).toLocaleString("es-AR")}</td>
              <td className="py-2">{log.entityType}</td>
              <td className="py-2 text-xs">{DIRECTION_LABELS[log.direction] ?? log.direction}</td>
              <td className={`py-2 font-medium ${STATUS_STYLES[log.status] ?? ""}`}>
                {log.status}
                {log.errorMessage && <p className="max-w-xs truncate text-xs font-normal text-muted">{log.errorMessage}</p>}
              </td>
              <td className="py-2 text-right">
                {log.status === "FAILED" && (
                  <button onClick={() => retry.mutate(log.id)} disabled={retry.isPending} className="underline disabled:opacity-50">
                    Reintentar
                  </button>
                )}
              </td>
            </tr>
          ))}
          {(logs ?? []).length === 0 && !isLoading && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted">
                Todavía no hay eventos de sincronización.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
