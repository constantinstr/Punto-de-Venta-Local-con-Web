"use client";

import { useState } from "react";
import Link from "next/link";
import type { FiscalTaxCondition } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores } from "@/hooks/useCatalog";
import { useFiscalConfig } from "@/hooks/useFiscalConfig";
import {
  useCreateFiscalConfig,
  useUpdateFiscalConfig,
} from "@/hooks/useFiscalConfigAdmin";
import { ApiError } from "@/lib/api";

const TAX_CONDITIONS: { value: FiscalTaxCondition; label: string }[] = [
  { value: "MONOTRIBUTO", label: "Monotributo" },
  { value: "RESPONSABLE_INSCRIPTO", label: "Responsable Inscripto" },
  { value: "EXENTO", label: "Exento" },
];

// Lee un .crt/.key como texto. Son archivos PEM (texto plano), así que no
// hace falta subirlos al servidor como binario: se mandan en el JSON, igual
// que si se pegaran a mano.
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsText(file);
  });
}

export default function AfipSettingsPage() {
  const user = useRequireAuth();
  const { data: stores } = useStores();
  const [storeId, setStoreId] = useState("");
  const { data: config, isLoading } = useFiscalConfig(storeId || undefined);
  const createConfig = useCreateFiscalConfig();
  const updateConfig = useUpdateFiscalConfig();

  const [cuit, setCuit] = useState("");
  const [taxCondition, setTaxCondition] = useState<FiscalTaxCondition>("MONOTRIBUTO");
  const [ptoVta, setPtoVta] = useState("");
  const [grossIncomeNumber, setGrossIncomeNumber] = useState("");
  const [activityStartDate, setActivityStartDate] = useState("");
  const [isProduction, setIsProduction] = useState(false);
  const [crt, setCrt] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  const existing = config ?? null;
  const editing = Boolean(existing);

  async function handleFile(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: string) => void,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      setter(await readFileAsText(file));
    } catch {
      setError("No se pudo leer el archivo. Probá pegando el contenido a mano.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!storeId) {
      setError("Elegí el local al que corresponde esta configuración.");
      return;
    }
    // El par va junto o no va: un certificado nuevo con la clave vieja no
    // firma nada y AFIP rechazaría todo sin explicar por qué.
    if (Boolean(crt) !== Boolean(key)) {
      setError("Cargá el certificado y la clave juntos: uno sin el otro no sirve.");
      return;
    }
    if (!editing && (!crt || !key)) {
      setError("Para activar la facturación hacen falta el certificado y la clave.");
      return;
    }

    try {
      if (existing) {
        await updateConfig.mutateAsync({
          id: existing.id,
          input: {
            cuit: cuit || undefined,
            taxCondition,
            ptoVta: ptoVta ? Number(ptoVta) : undefined,
            grossIncomeNumber: grossIncomeNumber || undefined,
            activityStartDate: activityStartDate || undefined,
            isProduction,
            ...(crt && key ? { crtCertificate: crt, keyCertificate: key } : {}),
          },
        });
      } else {
        await createConfig.mutateAsync({
          storeId,
          cuit,
          taxCondition,
          ptoVta: Number(ptoVta),
          grossIncomeNumber: grossIncomeNumber || undefined,
          activityStartDate: activityStartDate || undefined,
          crtCertificate: crt,
          keyCertificate: key,
          isProduction,
        });
      }
      setCrt("");
      setKey("");
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo guardar la configuración",
      );
    }
  }

  const pending = createConfig.isPending || updateConfig.isPending;

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link href="/settings" className="text-sm text-muted underline">
        ← Configuración
      </Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold text-foreground">
        Facturación AFIP
      </h1>
      <p className="mb-6 text-sm text-muted">
        La configuración es <strong>por local</strong>: cada uno factura con su
        propio punto de venta.
      </p>

      <select
        value={storeId}
        onChange={(e) => {
          setStoreId(e.target.value);
          setSaved(false);
          setError(null);
        }}
        className="mb-6 rounded border border-border bg-surface px-3 py-2 text-sm"
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
          Seleccioná el local que va a emitir los comprobantes.
        </p>
      )}

      {storeId && isLoading && <p className="text-sm text-muted">Cargando…</p>}

      {storeId && !isLoading && (
        <>
          <section
            className={`mb-6 rounded-lg border p-4 ${
              existing ? "border-success bg-success-muted" : "border-border bg-surface"
            }`}
          >
            {existing ? (
              <>
                <p className="font-medium text-foreground">
                  Facturación activa · CUIT {existing.cuit} · Punto de venta{" "}
                  {existing.ptoVta}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Entorno:{" "}
                  <strong>
                    {existing.isProduction ? "Producción" : "Homologación (pruebas)"}
                  </strong>
                  . El certificado ya está cargado y guardado cifrado — por
                  seguridad no se puede volver a ver, solo reemplazar.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">
                  Este local todavía no factura
                </p>
                <p className="mt-1 text-sm text-muted">
                  Sin configuración fiscal solo se pueden emitir tickets internos
                  (no fiscales). Las ventas funcionan igual.
                </p>
              </>
            )}
          </section>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <label className="text-xs text-muted">
                CUIT del comercio
                <input
                  value={cuit}
                  onChange={(e) => setCuit(e.target.value.replace(/\D/g, ""))}
                  maxLength={11}
                  placeholder={existing?.cuit ?? "11 dígitos, sin guiones"}
                  className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-muted">
                Condición frente al IVA
                <select
                  value={taxCondition}
                  onChange={(e) => setTaxCondition(e.target.value as FiscalTaxCondition)}
                  className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                >
                  {TAX_CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Punto de venta
                <input
                  type="number"
                  min={1}
                  value={ptoVta}
                  onChange={(e) => setPtoVta(e.target.value)}
                  placeholder={existing ? String(existing.ptoVta) : "El habilitado en AFIP"}
                  className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-muted">
                Ingresos brutos (opcional)
                <input
                  value={grossIncomeNumber}
                  onChange={(e) => setGrossIncomeNumber(e.target.value)}
                  className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-muted">
                Inicio de actividades (opcional)
                <input
                  type="date"
                  value={activityStartDate}
                  onChange={(e) => setActivityStartDate(e.target.value)}
                  className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <fieldset className="rounded-lg border border-border bg-surface p-4">
              <legend className="px-1 text-sm font-medium text-foreground">
                Certificado digital
              </legend>
              <p className="mb-3 text-sm text-muted">
                {editing
                  ? "Solo hace falta si vas a reemplazarlo (los certificados de AFIP vencen cada 2 años). Dejalo vacío para conservar el actual."
                  : "Los dos archivos que descargaste de AFIP. Se guardan cifrados."}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted">
                  Certificado (.crt)
                  <input
                    type="file"
                    accept=".crt,.pem,.cer,text/plain"
                    onChange={(e) => void handleFile(e, setCrt)}
                    className="mt-1 block w-full text-sm"
                  />
                  {crt && <span className="mt-1 block text-success">Cargado ✓</span>}
                </label>
                <label className="text-xs text-muted">
                  Clave privada (.key)
                  <input
                    type="file"
                    accept=".key,.pem,text/plain"
                    onChange={(e) => void handleFile(e, setKey)}
                    className="mt-1 block w-full text-sm"
                  />
                  {key && <span className="mt-1 block text-success">Cargada ✓</span>}
                </label>
              </div>
            </fieldset>

            <fieldset className="rounded-lg border border-border bg-surface p-4">
              <legend className="px-1 text-sm font-medium text-foreground">Entorno</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isProduction}
                  onChange={(e) => setIsProduction(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-foreground">
                    Emitir comprobantes reales (producción)
                  </span>
                  <span className="block text-muted">
                    Sin tildar, las facturas van al entorno de pruebas de AFIP: se
                    obtiene un CAE pero <strong>no tienen validez fiscal</strong>.
                  </span>
                </span>
              </label>

              {isProduction && (
                <div className="mt-3 border-l-2 border-warning bg-warning-muted p-3 text-sm">
                  <p className="text-warning">
                    <strong>El certificado tiene que ser del circuito de producción.</strong>{" "}
                    Uno de homologación es rechazado por AFIP con un error de
                    certificado no confiable, y el comercio no va a poder facturar.
                  </p>
                </div>
              )}
            </fieldset>

            {error && <p className="text-sm text-danger">{error}</p>}
            {saved && (
              <p className="text-sm text-success">
                Configuración guardada. Ya se pueden emitir comprobantes desde este local.
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              {pending
                ? "Guardando…"
                : editing
                  ? "Guardar cambios"
                  : "Activar facturación"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
