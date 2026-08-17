"use client";

import { use, useState } from "react";
import Link from "next/link";
import type { PaymentMethod } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  useCustomer,
  useCustomerAccount,
  useUpdateCustomer,
  useRegisterAccountPayment,
  useRegisterAccountAdjustment,
} from "@/hooks/useCustomers";
import { useCashRegisters, useCurrentShift } from "@/hooks/useCashShifts";
import { useStores } from "@/hooks/useCatalog";
import { ApiError } from "@/lib/api";

const MOVEMENT_LABELS: Record<string, string> = {
  CHARGE: "Cargo",
  PAYMENT: "Pago",
  ADJUSTMENT: "Ajuste",
  CHARGE_REVERSAL: "Reversa de cargo",
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  DEBIT_CARD: "Débito",
  CREDIT_CARD: "Crédito",
  TRANSFER: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  CURRENT_ACCOUNT: "Cuenta corriente",
};

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useRequireAuth();
  const { data: customer, isLoading } = useCustomer(id);
  const [page, setPage] = useState(1);
  const { data: account } = useCustomerAccount(id, page);
  const { data: stores } = useStores();
  const updateCustomer = useUpdateCustomer();
  const registerPayment = useRegisterAccountPayment();
  const registerAdjustment = useRegisterAccountAdjustment();

  const [editingLimit, setEditingLimit] = useState(false);
  const [creditLimit, setCreditLimit] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [payStoreId, setPayStoreId] = useState("");
  const [payRegisterId, setPayRegisterId] = useState("");
  const { data: registers } = useCashRegisters(payStoreId || undefined);
  const { data: currentShift } = useCurrentShift(payRegisterId || undefined);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  if (isLoading || !customer) return <p className="p-8 text-muted">Cargando…</p>;

  const canManage = user.role === "OWNER" || user.role === "ADMIN" || user.role === "MANAGER";
  const canAdjust = user.role === "OWNER" || user.role === "ADMIN";
  const balance = Number(customer.accountBalance);
  const totalPages = account ? Math.max(1, Math.ceil(account.movements.total / account.movements.limit)) : 1;

  async function handleSaveLimit() {
    setError(null);
    try {
      await updateCustomer.mutateAsync({
        id,
        input: { creditLimit: creditLimit.trim() === "" ? null : Number(creditLimit) },
      });
      setEditingLimit(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el límite");
    }
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      setError("Ingresá un monto válido");
      return;
    }
    if (payMethod === "CASH" && !currentShift) {
      setError("Elegí una caja con un turno abierto para cobrar en efectivo");
      return;
    }
    try {
      await registerPayment.mutateAsync({
        id,
        input: {
          amount,
          method: payMethod,
          cashShiftId: payMethod === "CASH" ? currentShift?.id : undefined,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      setPayAmount("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el pago");
    }
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const delta = Number(adjustDelta);
    if (!delta || !adjustReason.trim()) {
      setError("Ingresá un monto (con signo) y un motivo");
      return;
    }
    try {
      await registerAdjustment.mutateAsync({ id, input: { delta, reason: adjustReason.trim() } });
      setAdjustDelta("");
      setAdjustReason("");
      setShowAdjustment(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el ajuste");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8 font-sans">
      <div>
        <Link href="/customers" className="text-sm text-muted underline">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{customer.name}</h1>
        {customer.businessName && customer.businessName !== customer.name && (
          <p className="text-sm text-muted">{customer.businessName}</p>
        )}
      </div>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted">Documento</p>
            <p>{customer.docNumber ? `${customer.docType} ${customer.docNumber}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Condición IVA</p>
            <p>{customer.taxCondition}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Email</p>
            <p>{customer.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Teléfono</p>
            <p>{customer.phone ?? "—"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">Saldo de cuenta corriente</p>
            <p className={`text-2xl font-bold ${balance > 0 ? "text-red-600" : ""}`}>
              ${balance.toLocaleString("es-AR")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Límite de crédito</p>
            {editingLimit ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="Sin límite"
                  className="w-24 rounded border border-border bg-surface px-2 py-1 text-right text-sm"
                />
                <button onClick={() => void handleSaveLimit()} className="text-xs underline">
                  Guardar
                </button>
              </div>
            ) : (
              <p>
                {customer.creditLimit ? `$${Number(customer.creditLimit).toLocaleString("es-AR")}` : "Sin límite"}
                {canManage && (
                  <button
                    onClick={() => {
                      setCreditLimit(customer.creditLimit ?? "");
                      setEditingLimit(true);
                    }}
                    className="ml-2 text-xs underline"
                  >
                    Editar
                  </button>
                )}
              </p>
            )}
          </div>
        </div>
      </section>

      {canManage && (
        <section className="rounded-lg border border-border bg-surface p-4 text-sm">
          <h2 className="mb-2 font-medium text-foreground">Registrar pago</h2>
          <form onSubmit={handlePay} className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted">
              Monto
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="mt-0.5 block w-28 rounded border border-border bg-surface px-2 py-1.5"
              />
            </label>
            <label className="text-xs text-muted">
              Medio
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                className="mt-0.5 block rounded border border-border bg-surface px-2 py-1.5"
              >
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[])
                  .filter((m) => m !== "CURRENT_ACCOUNT")
                  .map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
              </select>
            </label>
            {payMethod === "CASH" && (
              <>
                <label className="text-xs text-muted">
                  Local
                  <select
                    value={payStoreId}
                    onChange={(e) => {
                      setPayStoreId(e.target.value);
                      setPayRegisterId("");
                    }}
                    className="mt-0.5 block rounded border border-border bg-surface px-2 py-1.5"
                  >
                    <option value="">Seleccionar…</option>
                    {stores?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted">
                  Caja
                  <select
                    value={payRegisterId}
                    onChange={(e) => setPayRegisterId(e.target.value)}
                    disabled={!payStoreId}
                    className="mt-0.5 block rounded border border-border bg-surface px-2 py-1.5 disabled:opacity-50"
                  >
                    <option value="">Seleccionar…</option>
                    {registers?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                {payRegisterId && !currentShift && (
                  <p className="text-xs text-red-600">Esta caja no tiene un turno abierto.</p>
                )}
              </>
            )}
            <button
              type="submit"
              disabled={registerPayment.isPending}
              className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Registrar
            </button>
          </form>
        </section>
      )}

      {canAdjust && (
        <section className="rounded-lg border border-border bg-surface p-4 text-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-foreground">Ajuste manual</h2>
            <button onClick={() => setShowAdjustment((v) => !v)} className="text-xs underline">
              {showAdjustment ? "Cerrar" : "Nuevo ajuste"}
            </button>
          </div>
          {showAdjustment && (
            <form onSubmit={handleAdjust} className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted">
                Monto (+ o -)
                <input
                  type="number"
                  step="0.01"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  className="mt-0.5 block w-28 rounded border border-border bg-surface px-2 py-1.5"
                />
              </label>
              <label className="flex-1 text-xs text-muted">
                Motivo
                <input
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="mt-0.5 block w-full rounded border border-border bg-surface px-2 py-1.5"
                />
              </label>
              <button
                type="submit"
                disabled={registerAdjustment.isPending}
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Confirmar
              </button>
            </form>
          )}
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <h2 className="mb-2 font-medium text-foreground">Movimientos</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-3">Fecha</th>
              <th className="py-2 pr-3">Tipo</th>
              <th className="py-2 pr-3 text-right">Monto</th>
              <th className="py-2 pr-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {account?.movements.data.map((m) => (
              <tr key={m.id} className="border-b border-border">
                <td className="py-2 pr-3 text-xs text-muted">{new Date(m.createdAt).toLocaleString("es-AR")}</td>
                <td className="py-2 pr-3">{MOVEMENT_LABELS[m.type] ?? m.type}</td>
                <td className="py-2 pr-3 text-right">${Number(m.amount).toLocaleString("es-AR")}</td>
                <td className="py-2 pr-3 text-right">${Number(m.balanceAfter).toLocaleString("es-AR")}</td>
              </tr>
            ))}
            {account?.movements.data.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted">
                  Sin movimientos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {account && account.movements.total > account.movements.limit && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span>
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-border px-2 py-1 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-border px-2 py-1 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
