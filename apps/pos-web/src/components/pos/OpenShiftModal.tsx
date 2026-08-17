"use client";

import { useState, type FormEvent } from "react";
import type { CashRegister } from "@pos/shared-types";
import { useOpenShift } from "@/hooks/useCashShifts";
import { ApiError } from "@/lib/api";

export function OpenShiftModal({ cashRegister, onOpened }: { cashRegister: CashRegister; onOpened: () => void }) {
  const openShift = useOpenShift();
  const [initialAmount, setInitialAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await openShift.mutateAsync({ cashRegisterId: cashRegister.id, initialAmount: Number(initialAmount) });
      onOpened();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo abrir la caja");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg bg-surface p-6 bg-surface">
        <h2 className="text-lg font-medium">Abrir {cashRegister.name}</h2>
        <p className="text-sm text-muted">
          Ingresá el fondo inicial (efectivo con el que arrancás el turno) para empezar a vender.
        </p>

        <label className="block text-sm">
          Fondo inicial
          <input
            type="number"
            min={0}
            step="0.01"
            autoFocus
            required
            value={initialAmount}
            onChange={(e) => setInitialAmount(e.target.value)}
            className="mt-1 w-full rounded border border-border px-3 py-2   bg-surface"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={openShift.isPending}
          className="w-full rounded bg-green-600 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {openShift.isPending ? "Abriendo…" : "Abrir caja"}
        </button>
      </form>
    </div>
  );
}
