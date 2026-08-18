"use client";

import { useState } from "react";
import Link from "next/link";
import type { CustomerDocType, CustomerTaxCondition } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useCustomers, useCustomersList, useCreateCustomer } from "@/hooks/useCustomers";
import { ApiError } from "@/lib/api";

const TAX_CONDITION_LABELS: Record<CustomerTaxCondition, string> = {
  CONSUMIDOR_FINAL: "Consumidor Final",
  RESPONSABLE_INSCRIPTO: "Responsable Inscripto",
  MONOTRIBUTO: "Monotributo",
  EXENTO: "Exento",
};

export default function CustomersPage() {
  const user = useRequireAuth();
  const [q, setQ] = useState("");
  const [withDebt, setWithDebt] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const { data: customers, isLoading } = useCustomersList({
    q: q || undefined,
    withDebt,
    includeInactive,
  });

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl p-8 font-sans">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          {showCreate ? "Cerrar" : "+ Nuevo cliente"}
        </button>
      </div>

      {showCreate && <NewCustomerForm onDone={() => setShowCreate(false)} />}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <input
          placeholder="Buscar por nombre, CUIT/DNI o WhatsApp…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64 rounded border border-border bg-surface px-3 py-1.5"
        />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={withDebt} onChange={(e) => setWithDebt(e.target.checked)} />
          Solo con deuda
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Incluir inactivos
        </label>
      </div>

      {isLoading && <p className="text-muted">Cargando…</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 pr-3">Nombre</th>
            <th className="py-2 pr-3">Teléfono</th>
            <th className="py-2 pr-3">Ciudad</th>
            <th className="py-2 pr-3">Documento</th>
            <th className="py-2 pr-3 text-right">Saldo</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {customers?.map((c) => {
            const balance = Number(c.accountBalance);
            return (
              <tr key={c.id} className="border-b border-border">
                <td className="py-2 pr-3">
                  {c.name} {c.lastName ?? ""}
                  {!c.isActive && <span className="ml-1 text-xs text-muted">(inactivo)</span>}
                </td>
                <td className="py-2 pr-3 text-xs text-muted">{c.phone ?? c.whatsapp ?? "—"}</td>
                <td className="py-2 pr-3 text-xs text-muted">{c.city ?? "—"}</td>
                <td className="py-2 pr-3 text-xs text-muted">
                  {c.docNumber ? `${c.docType} ${c.docNumber}` : "—"}
                </td>
                <td className={`py-2 pr-3 text-right ${balance > 0 ? "text-red-600" : ""}`}>
                  ${balance.toLocaleString("es-AR")}
                </td>
                <td className="py-2 text-right">
                  <Link href={`/customers/${c.id}`} className="underline">
                    Ver
                  </Link>
                </td>
              </tr>
            );
          })}
          {customers?.length === 0 && !isLoading && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-muted">
                No hay clientes que coincidan con el filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Alta completa, separada del alta rápida de CustomerPicker (esa vive en el
// checkout con el cliente esperando y solo pide nombre + documento).
function NewCustomerForm({ onDone }: { onDone: () => void }) {
  const createCustomer = useCreateCustomer();
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [docType, setDocType] = useState<CustomerDocType>("DNI");
  const [docNumber, setDocNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [taxCondition, setTaxCondition] = useState<CustomerTaxCondition>("CONSUMIDOR_FINAL");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // No hay unicidad a nivel de base para docNumber (podría chocar con datos
  // ya cargados) — esto es una advertencia, no un bloqueo: un mostrador no
  // puede quedar trabado por un duplicado.
  const { data: possibleDuplicates } = useCustomers(docNumber.trim().length >= 5 ? docNumber.trim() : "");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;

    const dupe = docNumber.trim()
      ? possibleDuplicates?.find((c) => c.docNumber === docNumber.trim())
      : undefined;
    if (dupe && !duplicateWarning) {
      setDuplicateWarning(`Ya existe un cliente con ese documento: ${dupe.name}. Volvé a confirmar para crear igual.`);
      return;
    }

    try {
      await createCustomer.mutateAsync({
        name: name.trim(),
        lastName: lastName.trim() || undefined,
        docType,
        docNumber: docNumber.trim() || undefined,
        businessName: businessName.trim() || undefined,
        taxCondition,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el cliente");
    }
  }

  const isCompany = taxCondition !== "CONSUMIDOR_FINAL";

  return (
    <form
      onSubmit={handleCreate}
      className="mb-6 space-y-3 rounded-lg border border-border bg-surface p-4 text-sm"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-0.5 block w-40 rounded border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted">
          Apellido
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="mt-0.5 block w-40 rounded border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted">
          Tipo de documento
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as CustomerDocType)}
            className="mt-0.5 block rounded border border-border bg-surface px-2 py-1.5 text-sm"
          >
            <option value="DNI">DNI</option>
            <option value="CUIT">CUIT</option>
            <option value="PASAPORTE">Pasaporte</option>
            <option value="FINAL_CONSUMER">Sin documento</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Número
          <input
            value={docNumber}
            onChange={(e) => {
              setDocNumber(e.target.value);
              setDuplicateWarning(null);
            }}
            className="mt-0.5 block w-32 rounded border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className={isCompany ? "rounded border border-accent/40 bg-accent/5 p-2" : ""}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            Condición IVA
            <select
              value={taxCondition}
              onChange={(e) => setTaxCondition(e.target.value as CustomerTaxCondition)}
              className="mt-0.5 block rounded border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {(Object.keys(TAX_CONDITION_LABELS) as CustomerTaxCondition[]).map((t) => (
                <option key={t} value={t}>
                  {TAX_CONDITION_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs text-muted">
            Razón social
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-0.5 block w-56 rounded border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted">
          Teléfono
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-0.5 block w-36 rounded border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted">
          WhatsApp
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="549..."
            className="mt-0.5 block w-36 rounded border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex-1 text-xs text-muted">
          Dirección
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted">
          Ciudad
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="mt-0.5 block w-36 rounded border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {duplicateWarning && <p className="text-xs text-amber-600">{duplicateWarning}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={createCustomer.isPending || !name.trim()}
        className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {duplicateWarning ? "Crear de todos modos" : "Crear cliente"}
      </button>
    </form>
  );
}
