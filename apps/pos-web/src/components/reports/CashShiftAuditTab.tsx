"use client";

import { useState } from "react";
import type { CashShiftHistoryEntry } from "@pos/shared-types";
import { useShiftMovements } from "@/hooks/useCashShifts";
import { formatMoney as formatMoneyBase } from "@/lib/report-formatters";

function formatMoney(n: number | null): string {
  if (n === null) return "—";
  return formatMoneyBase(n);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR");
}

function DifferenceBadge({ difference }: { difference: number | null }) {
  if (difference === null) return <span className="text-zinc-400">—</span>;
  const isZero = Math.abs(difference) < 0.01;
  const isPositive = difference > 0;
  return (
    <span
      className={
        isZero
          ? "text-zinc-500"
          : isPositive
            ? "text-green-700 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
      }
    >
      {isZero ? "Sin diferencia" : `${isPositive ? "+" : ""}${formatMoney(difference)}`}
    </span>
  );
}

export function CashShiftAuditTab({ shifts }: { shifts: CashShiftHistoryEntry[] }) {
  const [selected, setSelected] = useState<CashShiftHistoryEntry | null>(null);

  return (
    <div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <th className="py-2">Caja</th>
            <th className="py-2">Cajero/a</th>
            <th className="py-2">Cierre</th>
            <th className="py-2 text-right">Esperado</th>
            <th className="py-2 text-right">Declarado</th>
            <th className="py-2 text-right">Diferencia</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => (
            <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2">{s.cashRegisterName}</td>
              <td className="py-2">{s.userFullName}</td>
              <td className="py-2 text-xs text-zinc-500">{formatDateTime(s.closedAt)}</td>
              <td className="py-2 text-right">{formatMoney(s.expectedCash)}</td>
              <td className="py-2 text-right">{formatMoney(s.actualCash)}</td>
              <td className="py-2 text-right">
                <DifferenceBadge difference={s.difference} />
              </td>
              <td className="py-2 text-right">
                <button onClick={() => setSelected(s)} className="underline">
                  Ver arqueo
                </button>
              </td>
            </tr>
          ))}
          {shifts.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-zinc-400">
                No hay cierres de caja en el período seleccionado.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {selected && <ShiftDetailModal shift={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ShiftDetailModal({ shift, onClose }: { shift: CashShiftHistoryEntry; onClose: () => void }) {
  const { data: movements } = useShiftMovements(shift.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 dark:bg-zinc-900">
        <div id="shift-close-receipt" className="space-y-3 text-sm">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Arqueo de caja — {shift.cashRegisterName}</h2>
          <p className="text-zinc-500">
            {shift.userFullName} · {formatDateTime(shift.closedAt)}
          </p>

          <dl className="grid grid-cols-2 gap-y-1 rounded border border-zinc-200 p-3 dark:border-zinc-800">
            <dt className="text-zinc-500">Monto inicial</dt>
            <dd className="text-right">{formatMoney(shift.initialAmount)}</dd>
            <dt className="text-zinc-500">Efectivo esperado</dt>
            <dd className="text-right">{formatMoney(shift.expectedCash)}</dd>
            <dt className="text-zinc-500">Efectivo declarado</dt>
            <dd className="text-right">{formatMoney(shift.actualCash)}</dd>
            <dt className="text-zinc-500">Diferencia</dt>
            <dd className="text-right">
              <DifferenceBadge difference={shift.difference} />
            </dd>
          </dl>

          <div>
            <h3 className="mb-1 font-medium text-zinc-700 dark:text-zinc-300">Movimientos del turno</h3>
            <ul className="space-y-1">
              {movements?.map((m) => (
                <li key={m.id} className="flex justify-between border-b border-zinc-100 py-1 dark:border-zinc-900">
                  <span>
                    {m.type === "INFLOW" ? "Ingreso" : "Egreso"} — {m.reason}
                  </span>
                  <span>{formatMoney(Number(m.amount))}</span>
                </li>
              ))}
              {movements?.length === 0 && <li className="text-zinc-400">Sin movimientos manuales.</li>}
            </ul>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 print:hidden">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm">
            Cerrar
          </button>
          <button
            onClick={() => window.print()}
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Reimprimir comprobante
          </button>
        </div>
      </div>
    </div>
  );
}
