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
  if (difference === null) return <span className="text-muted">—</span>;
  const isZero = Math.abs(difference) < 0.01;
  const isPositive = difference > 0;
  return (
    <span
      className={
        isZero
          ? "text-muted"
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
          <tr className="border-b border-border text-muted  ">
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
            <tr key={s.id} className="border-b border-border  ">
              <td className="py-2">{s.cashRegisterName}</td>
              <td className="py-2">{s.userFullName}</td>
              <td className="py-2 text-xs text-muted">{formatDateTime(s.closedAt)}</td>
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
              <td colSpan={7} className="py-6 text-center text-muted">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 p-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg bg-surface p-6 bg-surface">
        <div id="shift-close-receipt" className="space-y-3 text-sm">
          <h2 className="text-lg font-medium text-foreground  ">Arqueo de caja — {shift.cashRegisterName}</h2>
          <p className="text-muted">
            {shift.userFullName} · {formatDateTime(shift.closedAt)}
          </p>

          <dl className="grid grid-cols-2 gap-y-1 rounded border border-border p-3  ">
            <dt className="text-muted">Monto inicial</dt>
            <dd className="text-right">{formatMoney(shift.initialAmount)}</dd>
            <dt className="text-muted">Efectivo esperado</dt>
            <dd className="text-right">{formatMoney(shift.expectedCash)}</dd>
            <dt className="text-muted">Efectivo declarado</dt>
            <dd className="text-right">{formatMoney(shift.actualCash)}</dd>
            <dt className="text-muted">Diferencia</dt>
            <dd className="text-right">
              <DifferenceBadge difference={shift.difference} />
            </dd>
          </dl>

          <div>
            <h3 className="mb-1 font-medium text-foreground  ">Movimientos del turno</h3>
            <ul className="space-y-1">
              {movements?.map((m) => (
                <li key={m.id} className="flex justify-between border-b border-border py-1  ">
                  <span>
                    {m.type === "INFLOW" ? "Ingreso" : "Egreso"} — {m.reason}
                  </span>
                  <span>{formatMoney(Number(m.amount))}</span>
                </li>
              ))}
              {movements?.length === 0 && <li className="text-muted">Sin movimientos manuales.</li>}
            </ul>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 print:hidden">
          <button onClick={onClose} className="rounded px-4 py-2 text-sm">
            Cerrar
          </button>
          <button
            onClick={() => window.print()}
            className="rounded bg-accent px-4 py-2 text-sm text-white  "
          >
            Reimprimir comprobante
          </button>
        </div>
      </div>
    </div>
  );
}
