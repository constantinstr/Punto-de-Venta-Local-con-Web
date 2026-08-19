import Link from "next/link";

// Placeholder pedido por el usuario para destrabar los links del footer de "/"
// (antes apuntaban a "#"). Texto genérico, NO es asesoramiento legal — el
// aviso de abajo lo deja explícito. Mismo criterio que /terminos/page.tsx:
// tokens globales de globals.css, no los --vn-* de la landing.
export const metadata = {
  title: "Privacidad",
};

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="text-sm text-accent underline">
          ← Volver al inicio
        </Link>

        <h1 className="mt-6 text-2xl font-semibold">Política de Privacidad</h1>

        <p className="mt-4 rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">
          Este texto es un placeholder genérico y no reemplaza asesoramiento legal.
          Revisalo con un abogado antes de considerarlo vinculante.
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="font-medium">1. Qué datos se guardan</h2>
            <p className="mt-1 text-muted">
              El sistema es multi-tenant: cada comercio tiene sus propios datos, aislados por
              Row Level Security. Se guarda la información que cada comercio carga para
              operar — productos, ventas, clientes, proveedores, usuarios y comprobantes
              fiscales — y los datos de la cuenta de contacto usados para el alta y la demo.
            </p>
          </section>

          <section>
            <h2 className="font-medium">2. Credenciales sensibles</h2>
            <p className="mt-1 text-muted">
              Certificados AFIP y credenciales de integraciones externas (WooCommerce,
              Tienda Nube) se guardan cifrados, nunca en texto plano.
            </p>
          </section>

          <section>
            <h2 className="font-medium">3. Datos de pago</h2>
            <p className="mt-1 text-muted">
              El cobro de la suscripción se procesa a través de Mercado Pago. Los datos de
              tarjeta no pasan ni se almacenan en los servidores de Vende Nube.
            </p>
          </section>

          <section>
            <h2 className="font-medium">4. Con quién se comparten los datos</h2>
            <p className="mt-1 text-muted">
              No se venden ni se comparten datos con terceros ajenos al funcionamiento del
              servicio. Se comparten únicamente con los proveedores necesarios para operar:
              AFIP (facturación electrónica), Mercado Pago (cobro) y, si el comercio lo
              activa, WooCommerce o Tienda Nube (sincronización de catálogo y pedidos).
            </p>
          </section>

          <section>
            <h2 className="font-medium">5. Cuentas de demo vencidas</h2>
            <p className="mt-1 text-muted">
              Al vencer el período de prueba, los datos del comercio se conservan durante una
              ventana de gracia antes de eliminarse definitivamente si no se pasa al plan
              pago.
            </p>
          </section>

          <section>
            <h2 className="font-medium">6. Contacto</h2>
            <p className="mt-1 text-muted">
              Consultas sobre el tratamiento de tus datos:{" "}
              <a href="mailto:info@vendenube.com" className="text-accent underline">
                info@vendenube.com
              </a>
              .
            </p>
          </section>
        </div>

        <p className="mt-10 text-xs text-muted">
          Ver también{" "}
          <Link href="/terminos" className="underline">
            Términos y Condiciones
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
