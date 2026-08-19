"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AuthUser } from "@pos/shared-types";
import { useAuthStore } from "@/lib/auth-store";
import { NAV_ITEMS } from "./nav-items";

export function NavSidebar({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const logout = useAuthStore((s) => s.logout);
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-4 py-4">
        <p className="text-sm font-semibold text-foreground">Vende Nube</p>
        <p className="mt-0.5 truncate text-xs text-muted">{user.fullName}</p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded px-3 py-2 text-sm ${
                active ? "bg-accent-muted text-accent font-medium" : "text-foreground hover:bg-accent-muted"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          onClick={logout}
          className="w-full rounded px-3 py-2 text-left text-sm text-muted hover:bg-accent-muted"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
