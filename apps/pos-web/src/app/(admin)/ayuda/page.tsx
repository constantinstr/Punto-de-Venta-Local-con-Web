"use client";

import { useRequireAuth } from "@/hooks/useRequireAuth";

// Manual estático de un vistazo — sin librería de tour ni JS adicional, a
// propósito (decisión de producto): un checklist interactivo ya existe para
// el primer arranque (SetupChecklist en /inicio), esto es la referencia a
// la que volver después, cuando la duda es puntual ("¿cómo abro la caja?").
const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "vender",
    title: "Vender en el mostrador (POS)",
    body: (
      <>
        <p>
          Entrá a <strong>Punto de venta</strong> desde el menú lateral. Buscá el producto por
          nombre o código, o escaneá el código de barras si tenés lector conectado — se agrega
          solo a la venta en curso.
        </p>
        <p>
          Podés aplicar un descuento por línea o al total (dentro del tope que te haya dado tu
          OWNER/ADMIN), elegir el cliente para vender a cuenta corriente, y cobrar con uno o más
          medios de pago en la misma venta. Al confirmar, se descuenta el stock y se emite el
          comprobante fiscal si tu comercio tiene AFIP configurado.
        </p>
      </>
    ),
  },
  {
    id: "caja",
    title: "Caja: apertura, cierre y arqueo",
    body: (
      <>
        <p>
          Antes de vender hay que <strong>abrir la caja</strong> con el efectivo inicial. Todo
          movimiento de efectivo que no sea una venta (un retiro, un pago a un proveedor en
          efectivo) se registra como <strong>movimiento de caja</strong>, para que el arqueo
          final cierre.
        </p>
        <p>
          Al terminar el turno, <strong>cerrá la caja</strong>: el sistema te muestra cuánto
          debería haber según lo vendido y movido, contra lo que contás físicamente. La
          diferencia (si la hay) queda registrada en el cierre.
        </p>
      </>
    ),
  },
  {
    id: "catalogo",
    title: "Catálogo: productos, variantes, combos e importación",
    body: (
      <>
        <p>
          Cargá productos con precio, costo, stock por local y foto opcional. Un producto puede
          tener <strong>variantes</strong> (talle, color) que comparten nombre pero tienen su
          propio stock y código, o armarse como <strong>combo</strong> de otros productos con un
          precio conjunto.
        </p>
        <p>
          Si ya tenés un catálogo grande en una planilla, usá{" "}
          <strong>importación masiva</strong> (en Catálogo → Importar) para cargar todo de una
          vez en vez de producto por producto.
        </p>
      </>
    ),
  },
  {
    id: "clientes",
    title: "Clientes y cuenta corriente",
    body: (
      <p>
        Cada cliente puede tener <strong>cuenta corriente</strong>: vendele &ldquo;a cuenta&rdquo; desde el
        POS y el saldo queda pendiente hasta que registrés el pago desde su ficha en{" "}
        <strong>Clientes</strong>. Ahí también vas a ver el historial completo de compras y
        pagos de esa persona.
      </p>
    ),
  },
  {
    id: "presupuestos",
    title: "Presupuestos",
    body: (
      <p>
        Para una venta consultiva (el cliente quiere pensarlo, o pedís aprobación antes de
        facturar), armá un <strong>presupuesto</strong> en vez de una venta directa. Se puede
        compartir, y cuando el cliente confirma, se convierte en venta sin tener que cargar todo
        de nuevo.
      </p>
    ),
  },
  {
    id: "compras",
    title: "Compras y proveedores",
    body: (
      <p>
        Registrá tus <strong>proveedores</strong> y las <strong>compras</strong> que les hacés —
        cada compra recibida suma stock automáticamente al local que elijas, y queda el
        historial de costos para comparar precios entre proveedores con el tiempo.
      </p>
    ),
  },
  {
    id: "reportes",
    title: "Reportes",
    body: (
      <p>
        Ventas por período, producto más vendido, margen, stock bajo y más — todo filtrable por
        local y rango de fechas, con exportación a Excel para lo que necesites llevar afuera del
        sistema. Visible solo para OWNER/ADMIN.
      </p>
    ),
  },
  {
    id: "configuracion",
    title: "Configuración",
    body: (
      <>
        <p>
          Desde <strong>Configuración</strong> administrás roles y permisos del equipo, los
          topes de descuento por rol, los datos fiscales para AFIP, y la sincronización con
          WooCommerce o Tienda Nube si vendés también online (una sola de las dos a la vez, no
          las dos juntas).
        </p>
      </>
    ),
  },
];

export default function AyudaPage() {
  const user = useRequireAuth();
  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8 font-sans">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Ayuda</h1>
        <p className="mt-1 text-sm text-muted">
          Una guía rápida de cada parte del sistema. Si no encontrás lo que buscás, usá el botón
          de soporte (el círculo con &ldquo;?&rdquo; abajo a la derecha) o escribinos.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-border pb-4 text-sm">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-border px-3 py-1 text-foreground hover:bg-accent-muted"
          >
            {s.title}
          </a>
        ))}
      </nav>

      <div className="space-y-10">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-8 space-y-2">
            <h2 className="text-lg font-semibold text-foreground">{s.title}</h2>
            <div className="space-y-3 text-sm leading-relaxed text-foreground">{s.body}</div>
          </section>
        ))}
      </div>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">¿Seguís con dudas?</h2>
        <p className="mt-2 text-sm text-muted">
          Escribinos y te respondemos a la brevedad:
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <a href="mailto:info@vendenube.com.ar" className="underline">
            info@vendenube.com.ar
          </a>
          <a
            href="https://wa.me/5493854027008"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            WhatsApp
          </a>
        </div>
      </section>
    </div>
  );
}
