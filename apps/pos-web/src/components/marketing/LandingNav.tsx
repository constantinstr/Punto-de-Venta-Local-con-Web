"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

// Nav de la landing, separado de page.tsx porque necesita estado de cliente:
// - `scrolled` encoge el logo (empieza grande, se achica al bajar) sin tocar
//   la altura de la barra (h-20 fijo), así el pt-20 del wrapper y los
//   scroll-mt-20 de las secciones ancladas no se desincronizan.
// - `menuOpen` es el menú hamburguesa mobile: antes de esto, los links
//   Funciones/Precios/Contacto/Iniciar sesión vivían en un `hidden md:flex`
//   sin ningún trigger para mobile — invisibles y sin forma de navegar.
const LOGO_SRC = "/vende-nube-logo.webp";
const NAV_LINKS = [
  { href: "#funciones", label: "Funciones" },
  { href: "#precios", label: "Precios" },
  { href: "#contacto", label: "Contacto" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 w-full z-50 bg-[var(--vn-surface)]/90 backdrop-blur-md transition-shadow duration-300 ${
        scrolled ? "shadow-md" : "shadow-sm"
      }`}
    >
      <div className="flex justify-between items-center h-20 px-4 md:px-10 max-w-7xl mx-auto">
        <div
          className={`flex shrink-0 items-center transition-transform duration-300 ease-out ${
            scrolled ? "scale-[0.65]" : "scale-100"
          }`}
          style={{ transformOrigin: "left center" }}
        >
          {/* width/height deben mantener la proporción real del archivo
              (2000×521 ≈ 3.84:1) — Next.js los usa para fijar el
              aspect-ratio del <img>; un valor que no respeta esa proporción
              deforma el logo (bug reportado: se veía estirado en mobile).
              Base más chica en mobile (h-8) para que entre junto al botón y
              el hamburguesa sin que flexbox lo comprima aparte. */}
          <Image src={LOGO_SRC} alt="Vende Nube" width={215} height={56} className="h-8 w-auto md:h-14" priority />
        </div>

        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[var(--vn-on-surface-variant)] hover:text-[var(--vn-primary)] transition-colors font-semibold text-[14px]"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            className="text-[var(--vn-on-surface-variant)] hover:text-[var(--vn-primary)] transition-colors font-semibold text-[14px]"
          >
            Iniciar sesión
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* En pantallas ultra angostas (menos de ~380px) el logo + este
              botón + el hamburguesa no entran en una sola fila sin
              comprimirse — se oculta acá y queda disponible en el drawer
              (abajo) y como primer CTA del hero, un scroll más abajo. */}
          <a
            href="#demo"
            className="hidden min-[380px]:inline-block vn-glow bg-[var(--vn-primary)] hover:bg-[var(--vn-primary-container)] text-[var(--vn-on-primary)] text-[14px] leading-[20px] tracking-[0.01em] font-semibold py-2 px-4 md:px-6 rounded-full transition-all active:scale-95 whitespace-nowrap"
          >
            Probar demo gratis
          </a>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full text-[var(--vn-on-surface)] hover:bg-[var(--vn-surface-variant)] transition-colors"
          >
            <span className="material-symbols-outlined">{menuOpen ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-[var(--vn-surface-variant)] bg-[var(--vn-surface)] px-4 py-2 flex flex-col">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="py-3 text-[var(--vn-on-surface)] font-semibold text-[15px] border-b border-[var(--vn-surface-variant)]"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            onClick={() => setMenuOpen(false)}
            className="py-3 text-[var(--vn-on-surface)] font-semibold text-[15px] border-b border-[var(--vn-surface-variant)] min-[380px]:border-0"
          >
            Iniciar sesión
          </Link>
          <a
            href="#demo"
            onClick={() => setMenuOpen(false)}
            className="min-[380px]:hidden vn-glow bg-[var(--vn-primary)] text-[var(--vn-on-primary)] text-[14px] font-semibold py-3 rounded-full text-center mt-2 mb-1"
          >
            Probar demo gratis
          </a>
        </div>
      )}
    </nav>
  );
}
