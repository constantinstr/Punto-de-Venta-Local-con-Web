"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CashShift, CashMovementType } from "@pos/shared-types";
import { useShiftSummary, useShiftMovements, useAddMovement, useCloseShift } from "@/hooks/useCashShifts";
import { computeDifference, classifyDifference } from "@/stores/cash-calculations";
import { ApiError } from "@/lib/api";

type Tab = "movements" | "report" | "close";

export function CashControlModal({ shift, onClose, onClosed }: { shift: CashShift; onClose: () => void; onClosed: () => void }) {
  const [tab, setTab] = useState<Tab>("movements");

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-lg font-medium">Control de caja — {shift.cashRegister.name}</h2>
          <button onClick={onClose} className="text-zinc-400" aria-label="Cerrar">
            × (Esc)
          </button>
        </div>

        <div className="flex border-b border-zinc-200 text-sm dark:border-zinc-800">
          {(
            [
              ["movements", "Movimientos"],
              ["report", "Reporte X"],
              ["close", "Cierre Z"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 border-b-2 px-4 py-2 ${
                tab === key ? "border-zinc-900 font-medium dark:border-zinc-100" : "border-transparent text-zinc-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "movements" && <MovementsTab shiftId={shift.id} />}
          {tab === "report" && <ReportTab shiftId={shift.id} shift={shift} />}
          {tab === "close" && <CloseTab shiftId={shift.id} onClosed={onClosed} />}
        </div>
      </div>
    </div>
  );
}

function MovementsTab({ shiftId }: { shiftId: string }) {
  const { data: movements } = useShiftMovements(shiftId);
  const addMovement = useAddMovement(shiftId);
  const [type, setType] = useState<CashMovementType>("OUTFLOW");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addMovement.mutateAsync({ type, amount: Number(amount), reason });
      setAmount("");
      setReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el movimiento");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 text-sm">
        <label className="block">
          Tipo
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CashMovementType)}
            className="mt-1 rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="OUTFLOW">Retiro / gasto</option>
            <option value="INFLOW">Ingreso</option>
          </select>
        </label>
        <label className="block">
          Monto
          <input
            type="number"
            min={0.01}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-28 rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="flex-1 block">
          Motivo
          <input
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: pago de flete"
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <button
          type="submit"
          disabled={addMovement.isPending}
          className="rounded bg-zinc-900 px-3 py-1.5 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Registrar
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
            <th className="py-1.5">Hora</th>
            <th className="py-1.5">Tipo</th>
            <th className="py-1.5">Motivo</th>
            <th className="py-1.5 text-right">Monto</th>
          </tr>
        </thead>
        <tbody>
          {movements?.map((m) => (
            <tr key={m.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-1.5">{new Date(m.createdAt).toLocaleTimeString("es-AR")}</td>
              <td className="py-1.5">{m.type === "INFLOW" ? "Ingreso" : "Retiro"}</td>
              <td className="py-1.5">{m.reason}</td>
              <td className="py-1.5 text-right">
                {m.type === "OUTFLOW" ? "-" : "+"}${Number(m.amount).toLocaleString("es-AR")}
              </td>
            </tr>
          ))}
          {movements?.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-zinc-400">
                Sin movimientos todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReportTab({ shiftId, shift }: { shiftId: string; shift: CashShift }) {
  const { data: summary, isLoading } = useShiftSummary(shiftId);

  if (isLoading || !summary) return <p className="text-zinc-400">Calculando…</p>;

  return (
    <div className="space-y-2 text-sm">
      <p className="mb-2 text-xs text-zinc-400">
        Reporte X — arqueo parcial, no cierra el turno. Abierto {new Date(shift.openedAt).toLocaleString("es-AR")}.
      </p>
      <Row label="Fondo inicial" value={summary.initialAmount} />
      <Row label="Ingresos manuales" value={summary.totalInflows} sign="+" />
      <Row label="Retiros / gastos" value={summary.totalOutflows} sign="-" />
      <Row label="Ventas en efectivo" value={summary.cashSalesTotal} sign="+" note="disponible desde Sprint 5" />
      <div className="mt-3 flex items-baseline justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="font-medium">Total esperado en caja</span>
        <span className="text-2xl font-bold">${summary.expectedCash.toLocaleString("es-AR")}</span>
      </div>
    </div>
  );
}

function Row({ label, value, sign, note }: { label: string; value: number; sign?: "+" | "-"; note?: string }) {
  return (
    <div className="flex items-baseline justify-between text-zinc-600 dark:text-zinc-300">
      <span>
        {label}
        {note && <span className="ml-1 text-xs text-zinc-400">({note})</span>}
      </span>
      <span>
        {sign}${value.toLocaleString("es-AR")}
      </span>
    </div>
  );
}

function CloseTab({ shiftId, onClosed }: { shiftId: string; onClosed: () => void }) {
  const { data: summary } = useShiftSummary(shiftId);
  const closeShift = useCloseShift(shiftId);
  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const expectedCash = summary?.expectedCash ?? 0;
  const actualCashNumber = actualCash === "" ? null : Number(actualCash);
  const difference = actualCashNumber === null ? null : computeDifference(actualCashNumber, expectedCash);
  const kind = difference === null ? null : classifyDifference(difference);

  async function handleConfirm() {
    setError(null);
    try {
      await closeShift.mutateAsync({ actualCash: Number(actualCash), notes: notes || undefined });
      onClosed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cerrar el turno");
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-zinc-400">
        Contá el efectivo físico de la caja y escribí el total — el sistema calcula sobrante/faltante contra lo
        esperado. Esta acción cierra el turno y libera la terminal.
      </p>

      <label className="block">
        Efectivo contado
        <input
          type="number"
          min={0}
          step="0.01"
          value={actualCash}
          onChange={(e) => setActualCash(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-lg dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="block">
        Notas (opcional)
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      {difference !== null && (
        <div
          className={`rounded p-3 ${
            kind === "EXACT"
              ? "bg-zinc-100 dark:bg-zinc-800"
              : kind === "SURPLUS"
                ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          Esperado: ${expectedCash.toLocaleString("es-AR")} — Diferencia:{" "}
          <strong>
            {difference >= 0 ? "+" : ""}
            {difference.toLocaleString("es-AR")}
          </strong>{" "}
          ({kind === "EXACT" ? "exacto" : kind === "SURPLUS" ? "sobrante" : "faltante"})
        </div>
      )}

      {error && <p className="text-red-600">{error}</p>}

      {!confirming ? (
        <button
          type="button"
          disabled={actualCashNumber === null}
          onClick={() => setConfirming(true)}
          className="w-full rounded bg-red-600 py-2 font-medium text-white disabled:opacity-50"
        >
          Cerrar turno
        </button>
      ) : (
        <div className="space-y-2">
          <p className="font-medium">¿Confirmás el cierre? No se puede deshacer.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded border py-2">
              Volver
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={closeShift.isPending}
              className="flex-1 rounded bg-red-600 py-2 font-medium text-white disabled:opacity-50"
            >
              {closeShift.isPending ? "Cerrando…" : "Confirmar cierre"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
