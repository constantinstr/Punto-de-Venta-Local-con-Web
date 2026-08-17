"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AuthUser } from "@pos/shared-types";
import { NAV_ITEMS } from "@/components/layout/nav-items";

// El punto de venta vive fuera del grupo (admin), así que no tiene el menú
// lateral: es una pantalla de mostrador a pantalla completa, y el sidebar
// comería el ancho que menos sobra. Pero sin esto, entrar al POS era un
// callejón sin salida.
//
// Reutiliza NAV_ITEMS en vez de listar destinos acá: esa constante ya espeja
// los @Roles de cada controller, y dos copias de una lista de permisos se
// desincronizan siempre.
export function PosMenu({
  user,
  cartItemCount,
}: {
  user: AuthUser;
  cartItemCount: number;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const destinations = NAV_ITEMS.filter(
    (item) => item.href !== "/pos" && item.roles.includes(user.role),
  );

  // Esc cierra el menú, y se detiene la propagación para que no lo agarre el
  // manejador global de la página del POS (que usa Esc para sacar el foco de
  // los campos). Mismo criterio que los modales del POS.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }

    // Fase de captura: hay que llegar antes que el listener global de la
    // página, que está en `window` y también escucha Escape.
    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded border border-border bg-surface px-3 py-1 text-sm hover:border-border-strong"
      >
        ☰ Menú
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {destinations.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-foreground hover:bg-surface-muted"
            >
              {item.label}
            </Link>
          ))}

          {/* El carrito vive en sessionStorage, así que salir no lo pierde —
              pero el cajero no tiene forma de saberlo, y la duda sola alcanza
              para que no se anime a salir. */}
          {cartItemCount > 0 && (
            <p className="mt-1 border-t border-border px-4 py-2 text-xs text-muted">
              Tenés {cartItemCount}{" "}
              {cartItemCount === 1 ? "artículo" : "artículos"} en el carrito. Se
              guardan: al volver siguen ahí.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
