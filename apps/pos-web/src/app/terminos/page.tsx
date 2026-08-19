import Link from "next/link";

// Placeholder pedido por el usuario para destrabar los links del footer de "/"
// (antes apuntaban a "#"). Texto genérico, NO es asesoramiento legal — el
// aviso de abajo lo deja explícito. Usa los tokens globales de globals.css
// (bg-background, text-foreground, etc.), no los --vn-* de la landing: esta
// no es una pantalla del "mockup Stitch", es una página de contenido más del
// resto de la app.
export const metadata = {
  title: "Términos y Condiciones",
};

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="text-sm text-accent underline">
          ← Volver al inicio
        </Link>

        <h1 className="mt-6 text-2xl font-semibold">Términos y Condiciones</h1>

        <p className="mt-4 rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">
          Este texto es un placeholder genérico y no reemplaza asesoramiento legal.
          Revisalo con un abogado antes de considerarlo vinculante.
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="font-medium">1. El servicio</h2>
            <p className="mt-1 text-muted">
              Vende Nube es un sistema de punto de venta (POS) provisto como software como
              servicio (SaaS), con funciones de venta en mostrador, caja, stock, clientes,
              reportes, compras, facturación electrónica ante AFIP y sincronización con
              tiendas online (WooCommerce y Tienda Nube).
            </p>
          </section>

          <section>
            <h2 className="font-medium">2. Cuenta de demo y plan pago</h2>
            <p className="mt-1 text-muted">
              El acceso de prueba (demo) es gratuito, no requiere tarjeta y tiene límites de
              productos, locales y días de uso. Al vencer, la cuenta se bloquea pero los
              datos cargados se conservan durante una ventana de gracia. Pasar al plan pago
              no genera pérdida de información: se continúa sobre el mismo comercio.
            </p>
          </section>

          <section>
            <h2 className="font-medium">3. Uso del servicio</h2>
            <p className="mt-1 text-muted">
              Cada comercio es responsable de la información que carga (productos, clientes,
              ventas) y de mantener la confidencialidad de sus credenciales de acceso.
            </p>
          </section>

          <section>
            <h2 className="font-medium">4. Facturación electrónica (AFIP)</h2>
            <p className="mt-1 text-muted">
              La emisión de comprobantes electrónicos depende de la disponibilidad de los
              servicios web de AFIP y de que el comercio mantenga sus credenciales fiscales
              vigentes y correctamente configuradas.
            </p>
          </section>

          <section>
            <h2 className="font-medium">5. Modificaciones</h2>
            <p className="mt-1 text-muted">
              Estos términos pueden actualizarse. Los cambios relevantes se van a comunicar
              por los canales de contacto del comercio.
            </p>
          </section>

          <section>
            <h2 className="font-medium">6. Contacto</h2>
            <p className="mt-1 text-muted">
              Consultas sobre estos términos:{" "}
              <a href="mailto:info@vendenube.com.ar" className="text-accent underline">
                info@vendenube.com.ar
              </a>
              .
            </p>
          </section>
        </div>

        <p className="mt-10 text-xs text-muted">
          Ver también{" "}
          <Link href="/privacidad" className="underline">
            Política de Privacidad
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
