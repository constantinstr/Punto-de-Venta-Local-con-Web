"use client";

import Link from "next/link";
import { useStores, useProducts } from "@/hooks/useCatalog";
import { useCashRegisters } from "@/hooks/useCashShifts";
import { useOrdersList } from "@/hooks/useOrders";

interface Step {
  label: string;
  help: string;
  href: string;
  done: boolean;
}

// Panel de puesta en marcha para un comercio recién dado de alta.
//
// Cada paso se resuelve consultando el estado REAL (¿hay locales? ¿cajas?
// ¿productos? ¿ventas?), no una bandera guardada aparte: una bandera se
// desincroniza apenas alguien borra algo, y entonces el asistente miente.
// El costo es un par de consultas livianas en la portada.
export function SetupChecklist() {
  const { data: stores } = useStores();
  const firstStoreId = stores?.[0]?.id;

  const { data: registers } = useCashRegisters(firstStoreId);
  const { data: products } = useProducts({});
  const { data: orders } = useOrdersList({ limit: 1 });

  // Hasta no tener respuesta de todo, no se muestra nada: un panel que
  // aparece y desaparece mientras cargan las consultas es peor que esperar.
  const loaded =
    stores !== undefined &&
    products !== undefined &&
    orders !== undefined &&
    (firstStoreId ? registers !== undefined : true);
  if (!loaded) return null;

  const steps: Step[] = [
    {
      label: "Crear tu local",
      help: "La sucursal donde vendés. Podés agregar más después.",
      href: "/settings/stores",
      done: (stores?.length ?? 0) > 0,
    },
    {
      label: "Crear la caja",
      help: "El mostrador desde donde se cobra.",
      href: "/pos",
      done: (registers?.length ?? 0) > 0,
    },
    {
      label: "Cargar un producto",
      help: "Con nombre, precio y stock alcanza para empezar.",
      href: "/catalog/new",
      done: (products?.length ?? 0) > 0,
    },
    {
      label: "Hacer la primera venta",
      help: "Probá el circuito completo antes de atender.",
      href: "/pos",
      done: (orders?.total ?? 0) > 0,
    },
  ];

  const pending = steps.filter((s) => !s.done);
  if (pending.length === 0) return null;

  const doneCount = steps.length - pending.length;

  return (
    <section className="rounded-lg border border-accent bg-accent-muted p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium text-foreground">Puesta en marcha</h2>
        <span className="text-sm text-muted">
          {doneCount} de {steps.length} listos
        </span>
      </div>
      <p className="mb-4 text-sm text-muted">
        Con estos cuatro pasos ya podés vender. Este panel desaparece solo al
        completarlos.
      </p>

      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={step.href + String(i)} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs ${
                step.done
                  ? "border-success bg-success text-background"
                  : "border-border-strong text-muted"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </span>
            <span className="min-w-0">
              {step.done ? (
                <span className="text-muted line-through">{step.label}</span>
              ) : (
                <Link href={step.href} className="font-medium text-foreground hover:underline">
                  {step.label}
                </Link>
              )}
              {!step.done && <span className="block text-sm text-muted">{step.help}</span>}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 border-t border-border pt-3 text-sm text-muted">
        Cuando quieras emitir facturas,{" "}
        <Link href="/settings/integrations/afip" className="underline">
          configurá la facturación AFIP
        </Link>
        . No hace falta para empezar a vender.
      </p>
    </section>
  );
}
