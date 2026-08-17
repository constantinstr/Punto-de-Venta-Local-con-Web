import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export const metadata: Metadata = {
  title: "POS SaaS",
  description: "Punto de Venta Web/PWA multi-tenant",
};

// Corre ANTES del primer pintado, de forma síncrona. Next.js renderiza en el
// servidor, que no puede saber qué tema eligió esta terminal; si el atributo
// se aplicara recién al hidratar, en cada carga se vería un flash del tema
// equivocado (blanco de golpe en un local a oscuras, por ejemplo).
//
// Va como string y no como componente React a propósito: tiene que ejecutarse
// antes que cualquier JS de la app. Se mantiene mínimo y sin dependencias.
// "auto" (o sin valor guardado) deja el atributo sin estampar, que es lo que
// hace que mande el @media prefers-color-scheme de globals.css.
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {
    /* localStorage bloqueado (modo privado/kiosco): se cae al tema del SO. */
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
