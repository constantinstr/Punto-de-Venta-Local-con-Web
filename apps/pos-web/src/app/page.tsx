import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DemoCta } from "@/components/marketing/DemoCta";
import { LandingNav } from "@/components/marketing/LandingNav";

export const metadata: Metadata = {
  // Título completo, no el corto: el título de la landing vive en el MISMO segmento
  // de ruta que el layout raíz que define el `template` ("%s — Vende Nube"), y Next
  // documenta explícitamente que un template de layout.js NO aplica al title de un
  // page.js del mismo segmento (node_modules/next/dist/docs/.../generate-metadata.md,
  // sección "template") — solo a segmentos hijos (terminos, privacidad, login, etc.).
  title: "Vende Nube — POS con factura AFIP y stock sincronizado",
  description:
    "Vendé en el mostrador y en tu tienda online (WooCommerce, Tienda Nube) con el mismo stock. Facturación electrónica AFIP, caja, clientes y reportes. Funciona offline. Probá la demo gratis, sin tarjeta.",
  openGraph: {
    title: "Vende Nube — POS con factura AFIP y stock sincronizado",
    description:
      "Vendé en el mostrador y en tu tienda online con el mismo stock. Facturación AFIP, caja, clientes y reportes. Probá la demo gratis.",
    url: "/",
    siteName: "Vende Nube",
    locale: "es_AR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Vende Nube — POS con factura AFIP y stock sincronizado",
    description: "El mismo stock en el mostrador y en tu tienda online. Facturación AFIP incluida. Probá la demo gratis.",
  },
};

// Landing pública en "/" — antes acá vivía el dashboard autenticado
// (movido a /inicio, ver AppShell y NAV_ITEMS).
//
// Portado 1:1 desde el mockup "Vende Nube POS Omnicanal" generado en Stitch
// (MCP de Stitch, proyecto projects/10087957014680011679, pantalla
// "Landing Page Vende Nube"). A pedido explícito: fiel al mockup, con Google
// Fonts + imágenes remotas de Stitch — esto rompe a propósito el criterio
// "ultra liviano / sin fuentes ni imágenes externas" de globals.css y
// docs/ARCHITECTURE.md §6, pero ese criterio aplica al POS de mostrador, no
// a esta página pública de marketing.
//
// Paleta y tipografía viven en variables --vn-* scopeadas a `.vn-landing`
// (no se tocan los tokens --color-* globales de globals.css: son un sistema
// de diseño Material-You distinto, con nombres que colisionan por ejemplo en
// "surface" y "background" pero con valores distintos a los del resto de la
// app).
//
// Los botones "Probar demo gratis" del mockup eran estáticos: acá anclan a
// #demo, donde vive el <DemoCta /> real (mismo flujo de email + código de
// 6 dígitos que ya existía). El resto del contenido (copy, layout, iconos)
// es el que generó Stitch.
const PROBLEMS = [
  {
    icon: "inventory_2",
    iconBg: "bg-[var(--vn-error-container)] text-[var(--vn-error)]",
    title: "¿Stock desincronizado?",
    body: "Sincronización automática con WooCommerce y Tienda Nube.",
    premium: true,
  },
  {
    icon: "wifi_off",
    iconBg: "bg-[var(--vn-tertiary-container)] text-[var(--vn-on-tertiary-container)]",
    title: "¿Internet inestable?",
    body: "Funciona offline. Seguí vendiendo aunque se corte el WiFi.",
    premium: false,
  },
  {
    icon: "hourglass_empty",
    iconBg: "bg-[var(--vn-secondary-container)] text-[var(--vn-on-secondary-container)]",
    title: "¿Trámites AFIP lentos?",
    body: "Factura electrónica A/B/C con QR integrada en segundos.",
    premium: true,
  },
];

// Chip "Premium" — las únicas 3 funciones que el sistema realmente gatea
// detrás del plan pago son AFIP, sync WooCommerce y sync Tienda Nube (ver
// apps/api/src/billing/plan.service.ts). El resto (POS, caja, stock,
// clientes, presupuestos, compras, reportes, roles) funciona completo ya en
// la demo gratis — este chip evita que el visitante crea lo contrario.
const PREMIUM_CHIP =
  "ml-2 inline-block align-middle rounded-full bg-[var(--vn-secondary)]/10 text-[var(--vn-secondary)] text-[10px] font-bold uppercase tracking-wide px-2 py-0.5";

// Clases completas y estáticas por color — Tailwind escanea el código fuente
// buscando strings literales; una clase armada con interpolación en runtime
// (p. ej. `bg-[var(--vn-${color})]/10`) no la detecta y no genera el CSS.
const FEATURE_ICON_CLASS: Record<string, string> = {
  primary: "bg-[var(--vn-primary)]/10 text-[var(--vn-primary)]",
  secondary: "bg-[var(--vn-secondary)]/10 text-[var(--vn-secondary)]",
  tertiary: "bg-[var(--vn-tertiary)]/10 text-[var(--vn-tertiary)]",
  error: "bg-[var(--vn-error)]/10 text-[var(--vn-error)]",
};

const FEATURES = [
  {
    icon: "point_of_sale",
    color: "primary",
    title: "POS Rápido",
    body: "Interfaz touch-friendly para mostrador, funciona offline.",
    premium: false,
  },
  {
    icon: "category",
    color: "secondary",
    title: "Catálogo Centralizado",
    body: "Productos simples, variables y combos, con alertas de stock bajo.",
    premium: false,
  },
  {
    icon: "point_of_sale",
    color: "tertiary",
    title: "Caja y Turnos",
    body: "Apertura y cierre, arqueo y movimientos de efectivo.",
    premium: false,
  },
  {
    icon: "account_balance_wallet",
    color: "primary",
    title: "Cuentas Corrientes",
    body: "Clientes, límite de crédito y presupuestos.",
    premium: false,
  },
  {
    icon: "local_shipping",
    color: "secondary",
    title: "Compras y Proveedores",
    body: "Alta de proveedores y actualización de costos por compra.",
    premium: false,
  },
  {
    icon: "monitoring",
    color: "tertiary",
    title: "Reportes en Vivo",
    body: "Ventas, márgenes y stock bajo, exportables a Excel y PDF.",
    premium: false,
  },
  {
    icon: "sync",
    color: "primary",
    title: "Sincronización Real",
    body: "Integrado con WooCommerce y Tienda Nube.",
    premium: true,
  },
  {
    icon: "receipt_long",
    color: "error",
    title: "AFIP Ready",
    body: "Facturas A, B, C y QR fiscal sin salir del sistema.",
    premium: true,
  },
  {
    icon: "admin_panel_settings",
    color: "secondary",
    title: "Roles y Permisos",
    body: "Cada usuario ve y hace solo lo que su rol permite.",
    premium: false,
  },
];

// Estructura real del sistema (apps/api/src/billing/plan.service.ts,
// apps/api/src/demo/demo.service.ts): un solo plan pago ("standard", que la
// UI llama "Premium"), sin precio fijo en código — lo carga a mano un
// SUPERADMIN por comercio desde /platform. "Plan Empresarial" no es un tier
// del sistema: es una puerta de entrada a una conversación de venta, no
// promete nada que la demo o el plan pago no tengan ya (ver nota en `items`
// de abajo: sucursales ilimitadas ya están incluidas en Premium).
const CONTACT_EMAIL = "info@vendenube.com";
const WHATSAPP_NUMBER = "5493854027008";
const WHATSAPP_URL = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

type Plan = {
  name: string;
  pitch: string;
  items: string[];
  cta: string;
  href: string;
  note?: string;
  variant: "outline" | "recommended" | "muted";
};

const PLANS: Plan[] = [
  {
    name: "Plan Estándar",
    pitch: "Arrancá gratis, sin tarjeta. Ideal para probar el sistema en tu comercio.",
    items: [
      "POS, caja, stock, clientes y reportes completos",
      "Hasta 20 productos y 1 local",
      "9 productos de ejemplo precargados",
      "7 días de uso, sin tarjeta",
    ],
    cta: "Probar gratis",
    href: "#demo",
    variant: "outline" as const,
  },
  {
    name: "Plan Premium",
    pitch: "El plan completo: tu comercio y tu tienda online sin límites.",
    items: [
      "Todo lo de Estándar, sin límite de productos ni locales",
      "Facturación electrónica AFIP (A/B/C + QR)",
      "Sincronización con WooCommerce",
      "Sincronización con Tienda Nube",
    ],
    cta: "Empezar gratis",
    href: "#demo",
    note: "Arrancás con la demo y pasás a Premium cuando quieras, sin perder tus datos. Precio a medida — te lo cotizamos.",
    variant: "recommended" as const,
  },
  {
    name: "Plan Empresarial",
    pitch: "Para cadenas, franquicias o necesidades a medida.",
    items: [
      "Asesoramiento y onboarding personalizado",
      "Migración y carga inicial de catálogo asistida",
      "Soporte prioritario",
      "Desarrollos e integraciones a medida",
    ],
    cta: "Hablemos",
    href: WHATSAPP_URL("Hola, quiero consultar por el plan Empresarial de Vende Nube."),
    variant: "muted" as const,
  },
];

// Logo oficial de Vende Nube (isotipo + wordmark en un solo archivo, 2000×521px)
// — reemplaza el logo genérico que había generado Stitch. Vive en public/
// porque es un asset propio del proyecto, no de Stitch, así que va por
// next/image (optimizado, sin necesidad de allowlist de dominios remotos).
const LOGO_SRC = "/vende-nube-logo.webp";
const HERO_SRC =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCPQNQWEI8e4PvWywZIW1wbxO_w4mC7koDPEd-o-mMuuiNoQTS0E2y4XVFYOXnzDBhiobX8E9o-QMFDiYKwzQufJiVohyH1tzcMcm93av2eSqYp8YVcZdUUCoQadXe0uabsiqY_xvwcpTPp98MlsObdSwypBAOhZGbt8W8plcgh8FxkN8t11y5M_dYbeQ8g1pK3wVMMg1rhYM8-jt5tcNf9z452VpRIDwgXMFkKeiHSs8kpPxHva-tu6Q";

const displayLg =
  "text-[32px] leading-[40px] tracking-[-0.02em] font-extrabold md:text-[48px] md:leading-[56px]";
const headlineLg =
  "text-[24px] leading-[32px] font-bold md:text-[32px] md:leading-[40px] md:tracking-[-0.01em]";
const headlineMd = "text-[24px] leading-[32px] font-bold";
const bodyLg = "text-[18px] leading-[28px]";
const bodyMd = "text-[16px] leading-[24px]";
const labelMd = "text-[14px] leading-[20px] tracking-[0.01em] font-semibold";
const labelSm = "text-[12px] leading-[16px] font-medium";

export default function LandingPage() {
  return (
    <>
      {/* Autoalojado sería más "ultra liviano", pero se pidió fidelidad 1:1
          al mockup de Stitch — React 19 hoistea estos <link> a <head>. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
      />
      <style>{`
        .vn-landing {
          --vn-background: #faf9fe;
          --vn-on-background: #1a1b1f;
          --vn-surface: #faf9fe;
          --vn-surface-variant: #e3e2e7;
          --vn-surface-container-low: #f4f3f8;
          --vn-surface-container-lowest: #ffffff;
          --vn-surface-container-highest: #e3e2e7;
          --vn-inverse-surface: #2f3034;
          --vn-inverse-on-surface: #f1f0f5;
          --vn-on-surface: #1a1b1f;
          --vn-on-surface-variant: #414755;
          --vn-primary: #0058bc;
          --vn-on-primary: #ffffff;
          --vn-primary-container: #0070eb;
          --vn-primary-fixed: #d8e2ff;
          --vn-inverse-primary: #adc6ff;
          --vn-secondary: #4c4aca;
          --vn-on-secondary: #ffffff;
          --vn-secondary-container: #6664e4;
          --vn-on-secondary-container: #fffbff;
          --vn-tertiary: #8a2bb9;
          --vn-tertiary-container: #a649d5;
          --vn-tertiary-fixed: #f6d9ff;
          --vn-on-tertiary-container: #fffbff;
          --vn-error: #ba1a1a;
          --vn-error-container: #ffdad6;
          --vn-outline: #717786;
          --vn-outline-variant: #c1c6d7;
          font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
        }
        .vn-landing .material-symbols-outlined {
          font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
        }
        .vn-landing .vn-shadow-card {
          box-shadow: 0px 4px 20px rgba(0, 0, 0, 0.05);
        }
        .vn-landing .vn-shadow-hover:hover {
          box-shadow: 0px 12px 40px rgba(0, 0, 0, 0.12);
        }
        .vn-landing .vn-glow {
          box-shadow: 0 4px 14px 0 rgba(0, 88, 188, 0.39);
        }
        /* Scroll suave al navegar entre secciones por ancla (#funciones,
           #precios, #contacto, #demo). Scopeado a :has(.vn-landing) porque
           el contenedor que scrollea es <html>, no el div .vn-landing — y
           así no afecta al resto de la app (POS autenticado). Respeta
           prefers-reduced-motion, mismo criterio que .animate-premium-glow
           en globals.css. */
        @media (prefers-reduced-motion: no-preference) {
          html:has(.vn-landing) {
            scroll-behavior: smooth;
          }
        }
        /* Flotación sutil de la imagen del hero — vaivén vertical lento, no
           una animación de carga ni de atención. Mismo criterio de
           prefers-reduced-motion que el resto del proyecto (ver
           .animate-premium-glow en globals.css). */
        @keyframes vn-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-14px);
          }
        }
        @media (prefers-reduced-motion: no-preference) {
          .vn-landing .vn-float {
            animation: vn-float 6s ease-in-out infinite;
          }
        }
      `}</style>

      <div className="vn-landing min-h-screen overflow-x-hidden bg-[var(--vn-background)] text-[var(--vn-on-background)] antialiased pt-20">
        <LandingNav />

        {/* Hero */}
        <section className="py-8 md:py-24 px-4 md:px-10 max-w-7xl mx-auto relative overflow-hidden">
          <div className="absolute top-0 right-0 -z-10 w-[500px] h-[500px] bg-[var(--vn-primary-fixed)]/30 rounded-full blur-3xl opacity-50" />
          <div className="absolute bottom-0 left-0 -z-10 w-[400px] h-[400px] bg-[var(--vn-tertiary-fixed)]/30 rounded-full blur-3xl opacity-50" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-4">
              <h1 className={`${displayLg} text-[var(--vn-on-surface)]`}>
                Vende Nube: un solo sistema para vender en el mostrador y online, con el stock{" "}
                <span className="text-[var(--vn-primary)]">siempre sincronizado</span>
              </h1>
              <p className={`${bodyLg} text-[var(--vn-on-surface-variant)] max-w-lg`}>
                Tu local y tu tienda online unidos. Facturación AFIP integrada y funciona offline.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <a
                  href="#demo"
                  className={`vn-glow bg-[var(--vn-primary)] hover:bg-[var(--vn-primary-container)] text-[var(--vn-on-primary)] ${labelMd} py-4 px-8 rounded-full transition-all text-center`}
                >
                  Probar demo gratis
                </a>
                <a
                  href="#funciones"
                  className={`bg-[var(--vn-surface)] hover:bg-[var(--vn-surface-variant)] text-[var(--vn-primary)] border border-[var(--vn-outline-variant)] ${labelMd} py-4 px-8 rounded-full transition-all text-center`}
                >
                  Ver cómo funciona
                </a>
              </div>
            </div>
            <div className="vn-float relative mt-8 md:mt-0">
              <div className="rounded-xl overflow-hidden vn-shadow-hover border border-[var(--vn-surface-variant)] bg-[var(--vn-surface-container-lowest)] aspect-video flex items-center justify-center relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- ídem: asset de Stitch, no de next/image */}
                <img
                  alt="Mockup del POS Vende Nube en una tablet de mostrador"
                  className="object-cover w-full h-full absolute inset-0 z-0 opacity-80"
                  src={HERO_SRC}
                />
                <div className="z-10 bg-[var(--vn-surface)]/90 backdrop-blur-sm p-4 rounded-lg flex items-center gap-2 border border-[var(--vn-surface-variant)] shadow-sm absolute bottom-4 left-4">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className={`${labelSm} text-[var(--vn-on-surface)]`}>Sistema Online</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem/Solution */}
        <section className="py-8 bg-[var(--vn-surface-container-low)]">
          <div className="px-4 md:px-10 max-w-7xl mx-auto">
            <div className="text-center mb-8">
              <h2 className={`${headlineMd} text-[var(--vn-on-surface)] mb-2`}>
                Los problemas de siempre, resueltos.
              </h2>
              <p className="text-[var(--vn-on-surface-variant)]">
                Diseñado específicamente para las necesidades del comercio en Argentina.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {PROBLEMS.map((p) => (
                <div
                  key={p.title}
                  className="vn-shadow-card vn-shadow-hover bg-[var(--vn-surface-container-lowest)] p-4 rounded-xl border border-transparent hover:border-[var(--vn-primary)]/20 transition-all group"
                >
                  <div
                    className={`w-12 h-12 ${p.iconBg} rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                  >
                    <span className="material-symbols-outlined">{p.icon}</span>
                  </div>
                  <h3 className={`${labelMd} text-[var(--vn-on-surface)] mb-2`}>
                    {p.title}
                    {p.premium && <span className={PREMIUM_CHIP}>Premium</span>}
                  </h3>
                  <div className="h-px bg-[var(--vn-surface-variant)] w-full my-4" />
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-[var(--vn-primary)] text-[20px]">
                      check_circle
                    </span>
                    <p className={`${bodyMd} text-[var(--vn-on-surface-variant)]`}>{p.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-8 px-4 md:px-10 max-w-7xl mx-auto scroll-mt-20" id="funciones">
          <div className="text-center mb-8">
            <h2 className={`${headlineLg} text-[var(--vn-on-surface)] mb-2`}>
              Todo lo que tu comercio necesita
            </h2>
            <p className="text-[var(--vn-on-surface-variant)]">Herramientas potentes en una interfaz simple.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex gap-4 p-4 rounded-xl hover:bg-[var(--vn-surface-container-low)] transition-colors"
              >
                <div
                  className={`w-12 h-12 shrink-0 ${FEATURE_ICON_CLASS[f.color]} rounded-full flex items-center justify-center`}
                >
                  <span className="material-symbols-outlined">{f.icon}</span>
                </div>
                <div>
                  <h4 className={`${labelMd} text-[var(--vn-on-surface)] mb-1`}>
                    {f.title}
                    {f.premium && <span className={PREMIUM_CHIP}>Premium</span>}
                  </h4>
                  <p className={`${bodyMd} text-[var(--vn-on-surface-variant)]`}>{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="py-8 bg-[var(--vn-surface-container-lowest)] scroll-mt-20" id="precios">
          <div className="px-4 md:px-10 max-w-7xl mx-auto">
            <div className="text-center mb-8">
              <h2 className={`${headlineLg} text-[var(--vn-on-surface)] mb-2`}>
                Planes simples y transparentes
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center max-w-5xl mx-auto">
              {PLANS.map((plan) => {
                const recommended = plan.variant === "recommended";
                const muted = plan.variant === "muted";
                return (
                  <div
                    key={plan.name}
                    className={`p-8 rounded-xl flex flex-col h-full ${
                      recommended
                        ? "bg-[var(--vn-surface-container-lowest)] vn-shadow-hover border-2 border-[var(--vn-secondary)] scale-105 relative z-10"
                        : "bg-[var(--vn-surface)] vn-shadow-card border border-[var(--vn-surface-variant)]"
                    }`}
                  >
                    {recommended && (
                      <div className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--vn-secondary)] text-[var(--vn-on-secondary)] px-4 py-1 rounded-full ${labelSm}`}>
                        Recomendado
                      </div>
                    )}
                    <h3 className={`${headlineMd} text-[var(--vn-on-surface)] mb-2`}>{plan.name}</h3>
                    <p className="text-[var(--vn-on-surface-variant)] mb-6 flex-grow">{plan.pitch}</p>
                    <ul className={`space-y-3 mb-8 ${muted ? "text-[var(--vn-on-surface-variant)]" : ""}`}>
                      {plan.items.map((item) => (
                        <li key={item} className="flex gap-2 items-center">
                          <span
                            className={`material-symbols-outlined text-[18px] ${
                              muted ? "text-[var(--vn-outline)]" : recommended ? "text-[var(--vn-secondary)]" : "text-[var(--vn-primary)]"
                            }`}
                          >
                            check
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <a
                      href={plan.href}
                      className={`w-full py-3 rounded-full text-center ${labelMd} transition-colors ${
                        recommended
                          ? "vn-glow bg-[var(--vn-primary)] text-[var(--vn-on-primary)] hover:bg-[var(--vn-primary-container)]"
                          : muted
                            ? "border border-[var(--vn-outline)] text-[var(--vn-on-surface)] hover:bg-[var(--vn-surface-variant)]"
                            : "border border-[var(--vn-primary)] text-[var(--vn-primary)] hover:bg-[var(--vn-primary)]/5"
                      }`}
                    >
                      {plan.cta}
                    </a>
                    {plan.note && (
                      <p className="text-[11px] leading-[16px] text-[var(--vn-on-surface-variant)] mt-3 text-center">
                        {plan.note}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Trust banner */}
        <section className="py-8 bg-[var(--vn-surface-variant)]/50 border-y border-[var(--vn-surface-variant)]">
          <div className="px-4 md:px-10 max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-center gap-4 text-center md:text-left">
            <span className="material-symbols-outlined text-[var(--vn-secondary)] text-[32px]">shield_locked</span>
            <p className={`${bodyMd} text-[var(--vn-on-surface-variant)] max-w-3xl`}>
              <strong className="text-[var(--vn-on-surface)]">Tus datos están seguros.</strong> Tecnología
              multi-tenant con Row Level Security. Diseñado 100% para el marco legal y fiscal argentino (AFIP).
            </p>
          </div>
        </section>

        {/* Demo real */}
        <section
          id="demo"
          className="py-16 md:py-24 px-4 md:px-10 max-w-7xl mx-auto text-center relative scroll-mt-20"
        >
          <div className="absolute inset-0 bg-[var(--vn-primary)]/5 rounded-3xl -z-10" />
          <h2 className={`${displayLg} text-[var(--vn-on-surface)] mb-4`}>Simplificá tu negocio hoy mismo.</h2>
          <p className={`${bodyLg} text-[var(--vn-on-surface-variant)] mb-8`}>
            Probá la demo funcional en segundos.
          </p>
          <div className="mx-auto flex w-full max-w-md flex-col items-center rounded-xl vn-shadow-card bg-[var(--vn-surface-container-lowest)] px-6 py-8 sm:px-8 border border-[var(--vn-surface-variant)]">
            <DemoCta />
          </div>
          <p className={`${bodyMd} text-[var(--vn-on-surface-variant)] mt-6 max-w-lg mx-auto`}>
            ¿Se venció tu demo? Tranquilo: tus datos quedan guardados 60 días.{" "}
            <a href="#contacto" className="text-[var(--vn-primary)] hover:underline font-semibold">
              Escribinos
            </a>{" "}
            y pasás a Premium sin perder nada.
          </p>
        </section>

        {/* Contacto */}
        <section
          id="contacto"
          className="py-16 px-4 md:px-10 max-w-7xl mx-auto scroll-mt-20"
        >
          <div className="text-center mb-8">
            <h2 className={`${headlineLg} text-[var(--vn-on-surface)] mb-2`}>Hablemos</h2>
            <p className="text-[var(--vn-on-surface-variant)]">
              ¿Dudas antes de arrancar? Escribinos por el canal que prefieras.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="vn-shadow-card vn-shadow-hover flex flex-col items-center text-center gap-2 bg-[var(--vn-surface-container-lowest)] p-6 rounded-xl border border-transparent hover:border-[var(--vn-primary)]/20 transition-all"
            >
              <span className="material-symbols-outlined text-[var(--vn-primary)] text-[28px]">mail</span>
              <span className={`${labelMd} text-[var(--vn-on-surface)]`}>Email</span>
              <span className={`${bodyMd} text-[var(--vn-on-surface-variant)]`}>{CONTACT_EMAIL}</span>
            </a>
            <a
              href={WHATSAPP_URL("Hola, quiero más información sobre Vende Nube.")}
              target="_blank"
              rel="noopener noreferrer"
              className="vn-shadow-card vn-shadow-hover flex flex-col items-center text-center gap-2 bg-[var(--vn-surface-container-lowest)] p-6 rounded-xl border border-transparent hover:border-[var(--vn-primary)]/20 transition-all"
            >
              <span className="material-symbols-outlined text-[var(--vn-primary)] text-[28px]">chat</span>
              <span className={`${labelMd} text-[var(--vn-on-surface)]`}>WhatsApp</span>
              <span className={`${bodyMd} text-[var(--vn-on-surface-variant)]`}>+54 9 385 402-7008</span>
            </a>
            <div className="vn-shadow-card flex flex-col items-center text-center gap-2 bg-[var(--vn-surface-container-lowest)] p-6 rounded-xl border border-transparent">
              <span className="material-symbols-outlined text-[var(--vn-primary)] text-[28px]">location_on</span>
              <span className={`${labelMd} text-[var(--vn-on-surface)]`}>Dirección</span>
              <span className={`${bodyMd} text-[var(--vn-on-surface-variant)]`}>
                Mza 36 Lote 17 B, Lomas del Golf, Santiago del Estero, Argentina
              </span>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-[var(--vn-surface-container-highest)] w-full py-8 px-4 md:px-10 mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-7xl mx-auto items-center">
            <div className="flex flex-col gap-4">
              <div className="flex items-center">
                <Image
                  src={LOGO_SRC}
                  alt="Vende Nube"
                  width={123}
                  height={32}
                  className="h-8 w-auto grayscale opacity-70"
                />
              </div>
              <p className={`${bodyMd} text-[var(--vn-on-surface-variant)]`}>
                © {new Date().getFullYear()} Vende Nube · vendenube.com.ar · Argentina 🇦🇷 · Desarrollado por{" "}
                <a
                  href="https://masvisitas.com.ar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline hover:text-[var(--vn-primary)]"
                >
                  Mas Visitas
                </a>
              </p>
            </div>
            <div className={`flex flex-wrap gap-x-6 gap-y-2 md:justify-end ${bodyMd} text-[var(--vn-on-surface-variant)]`}>
              <Link className="hover:underline hover:text-[var(--vn-primary)]" href="/login">
                Iniciar sesión
              </Link>
              <a className="hover:underline hover:text-[var(--vn-primary)]" href="#contacto">
                Contacto
              </a>
              <Link className="hover:underline hover:text-[var(--vn-primary)]" href="/terminos">
                Términos y Condiciones
              </Link>
              <Link className="hover:underline hover:text-[var(--vn-primary)]" href="/privacidad">
                Privacidad
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
