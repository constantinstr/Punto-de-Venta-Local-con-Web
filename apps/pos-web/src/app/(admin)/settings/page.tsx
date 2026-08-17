"use client";

import { useState } from "react";
import Link from "next/link";
import type { UserRole } from "@pos/shared-types";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStores } from "@/hooks/useCatalog";
import { useFiscalConfig } from "@/hooks/useFiscalConfig";
import { useWooCommerceConfig, useUpdateWooConfig } from "@/hooks/useWooCommerce";
import {
  useTiendanubeConfig,
  useUpdateTiendanubeConfig,
} from "@/hooks/useTiendanube";
import {
  IntegrationCard,
  type IntegrationState,
} from "@/components/settings/IntegrationCard";

interface SettingsLink {
  href: string;
  label: string;
  description: string;
  roles: UserRole[];
}

const LINKS: SettingsLink[] = [
  {
    href: "/settings/stores",
    label: "Locales",
    description: "Sucursales del comercio, cada una con su stock y su caja.",
    roles: ["OWNER", "ADMIN"],
  },
  {
    href: "/settings/categories",
    label: "Categorías",
    description: "Árbol de categorías del catálogo.",
    roles: ["OWNER", "ADMIN", "MANAGER"],
  },
  {
    href: "/settings/suppliers",
    label: "Proveedores",
    description: "Alta y datos de contacto de proveedores.",
    roles: ["OWNER", "ADMIN", "MANAGER"],
  },
  {
    href: "/settings/users",
    label: "Empleados",
    description: "Alta de usuarios, roles y contraseñas.",
    roles: ["OWNER", "ADMIN"],
  },
  {
    href: "/settings/discounts",
    label: "Descuentos",
    description: "Cuánto puede descontar cada rol en el mostrador.",
    roles: ["OWNER", "ADMIN"],
  },
  {
    href: "/settings/appearance",
    label: "Apariencia",
    description: "Tema claro u oscuro de esta computadora.",
    roles: ["OWNER", "ADMIN", "MANAGER", "CASHIER"],
  },
  {
    href: "/settings/audit",
    label: "Auditoría",
    description: "Historial de acciones sensibles del sistema.",
    roles: ["OWNER", "ADMIN"],
  },
  {
    href: "/settings/subscription",
    label: "Suscripción",
    description: "Estado de tu plan, pagos y débito automático.",
    roles: ["OWNER", "ADMIN"],
  },
];

export default function SettingsHubPage() {
  const user = useRequireAuth();
  const { data: stores } = useStores();

  // Las integraciones se configuran POR LOCAL. Para el caso corriente (un solo
  // local) el selector sería ruido, así que solo aparece cuando hay más de uno.
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const storeId = selectedStoreId || stores?.[0]?.id || "";

  const { data: fiscalConfig } = useFiscalConfig(storeId || undefined);
  const { data: wooConfig } = useWooCommerceConfig(storeId || undefined);
  const updateWoo = useUpdateWooConfig(wooConfig?.id ?? "");
  const { data: tnConfig } = useTiendanubeConfig(storeId || undefined);
  const updateTn = useUpdateTiendanubeConfig(tnConfig?.id);

  if (!user) return null;

  const links = LINKS.filter((l) => l.roles.includes(user.role));
  const canSeeIntegrations = user.role === "OWNER" || user.role === "ADMIN";

  const fiscalState: IntegrationState = !fiscalConfig
    ? "unconfigured"
    : "active";
  const wooState: IntegrationState = !wooConfig
    ? "unconfigured"
    : wooConfig.isActive
      ? "active"
      : "inactive";
  const tnState: IntegrationState = !tnConfig
    ? "unconfigured"
    : tnConfig.isActive
      ? "active"
      : "inactive";

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Configuración</h1>

      {canSeeIntegrations && (
        <section className="mb-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium text-foreground">Integraciones</h2>
            {stores && stores.length > 1 && (
              <label className="text-xs text-muted">
                Local:{" "}
                <select
                  value={storeId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="rounded border border-border bg-surface px-2 py-1 text-sm"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="space-y-3">
            <IntegrationCard
              name="Facturación AFIP"
              description="Emitir facturas con CAE y notas de crédito. Sin esto solo se emiten tickets internos."
              href="/settings/integrations/afip"
              state={fiscalState}
            />

            <IntegrationCard
              name="WooCommerce"
              description="Sincroniza stock y precios con tu tienda online, y trae los pedidos web."
              href="/settings/integrations/woocommerce"
              state={wooState}
              onToggle={
                wooConfig
                  ? (next) => updateWoo.mutate({ isActive: next })
                  : undefined
              }
              toggleDisabled={!wooConfig}
              toggleHint="Configurala primero"
            />

            <IntegrationCard
              name="Tienda Nube"
              description="Misma sincronización que WooCommerce, para tiendas en Tienda Nube."
              href="/settings/integrations/tiendanube"
              state={tnState}
              onToggle={
                tnConfig ? (next) => updateTn.mutate({ isActive: next }) : undefined
              }
              toggleDisabled={!tnConfig}
              toggleHint="Conectala primero"
            />
          </div>
        </section>
      )}

      <h2 className="mb-3 text-lg font-medium text-foreground">Tu comercio</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <p className="font-medium text-foreground">{l.label}</p>
            <p className="mt-1 text-sm text-muted">{l.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
