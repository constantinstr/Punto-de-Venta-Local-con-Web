import { Injectable, ForbiddenException } from '@nestjs/common';
import { withTenantContext, type Tenant, type TransactionClient } from '@pos/database';

// Las tres funciones que un tenant demo tiene bloqueadas por cartel Premium.
// El backend es la frontera real (este servicio + PlanFeatureInterceptor +
// los chequeos puntuales en InvoicesService/EcommerceSyncService); el
// frontend solo dibuja el candado usando el mismo nombre.
export type PremiumFeature = 'FISCAL_INVOICING' | 'WOO_SYNC' | 'TIENDANUBE_SYNC';

// Sembrar 9 productos (ver DemoSeedService) deja margen bajo este tope para
// que el visitante pueda crear productos propios antes de toparlo — si
// chocara el límite en su primer intento la demo se sentiría rota, no
// limitada.
export const DEMO_PRODUCT_LIMIT = 20;
export const DEMO_STORE_LIMIT = 1;

const CACHE_TTL_MS = 60_000;

export interface PlanInfo {
  tier: 'standard' | 'demo';
  isDemo: boolean;
  demoExpiresAt: Date | null;
}

const FEATURE_MESSAGES: Record<PremiumFeature, string> = {
  FISCAL_INVOICING:
    'La facturación electrónica AFIP es parte del plan pago. Registrá tu comercio para emitir Factura A/B/C.',
  WOO_SYNC:
    'La sincronización con WooCommerce es parte del plan pago. Registrá tu comercio para conectar tu tienda online.',
  TIENDANUBE_SYNC:
    'La sincronización con Tienda Nube es parte del plan pago. Registrá tu comercio para conectar tu tienda online.',
};

interface CacheEntry {
  info: PlanInfo;
  expiresAt: number;
}

// Única fuente de verdad de "¿qué plan tiene este tenant y qué le está
// permitido?". SubscriptionEnforcementInterceptor resuelve "¿pagó a tiempo?"
// — son preguntas distintas a propósito, ver el comentario de
// PlanFeatureInterceptor.
@Injectable()
export class PlanService {
  // Cache en memoria de proceso, no distribuida: el plan de un tenant no
  // cambia de golpe (pasar de demo a standard es un registro nuevo, no un
  // update), así que el peor caso de un TTL de 60s es una función bloqueada
  // de más/de menos por un minuto — nunca una brecha real, porque la
  // frontera dura (assertQuota) siempre cuenta filas frescas dentro de la
  // misma transacción del insert.
  private readonly cache = new Map<string, CacheEntry>();

  private remember(tenant: Pick<Tenant, 'id' | 'planTier' | 'demoExpiresAt'>): PlanInfo {
    const info: PlanInfo = {
      tier: tenant.planTier === 'demo' ? 'demo' : 'standard',
      isDemo: tenant.planTier === 'demo',
      demoExpiresAt: tenant.demoExpiresAt,
    };
    this.cache.set(tenant.id, { info, expiresAt: Date.now() + CACHE_TTL_MS });
    return info;
  }

  // Para el caller que ya tiene la fila Tenant a mano (p. ej.
  // SubscriptionEnforcementInterceptor, que la carga en cada request de
  // todos modos) — evita un round-trip extra.
  planOf(tenant: Pick<Tenant, 'id' | 'planTier' | 'demoExpiresAt'>): PlanInfo {
    return this.remember(tenant);
  }

  // Para servicios que no tienen la fila Tenant a mano (InvoicesService,
  // EcommerceSyncService, los controllers de integraciones).
  async getPlan(tenantId: string): Promise<PlanInfo> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.info;

    const tenant = await withTenantContext(tenantId, (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, planTier: true, demoExpiresAt: true },
      }),
    );
    if (!tenant) return { tier: 'standard', isDemo: false, demoExpiresAt: null };
    return this.remember(tenant);
  }

  async isDemo(tenantId: string): Promise<boolean> {
    return (await this.getPlan(tenantId)).isDemo;
  }

  // Usado en el branch fiscal de InvoicesService y por PlanFeatureInterceptor
  // vía el decorador @Premium. Nunca se llama en el camino de venta normal
  // (Ticket X) — ver el comentario en invoices.service.ts.
  async assertFeature(tenantId: string, feature: PremiumFeature): Promise<void> {
    const plan = await this.getPlan(tenantId);
    if (!plan.isDemo) return;
    throw new ForbiddenException(FEATURE_MESSAGES[feature]);
  }

  // Cuenta y valida DENTRO de la misma transacción que hace el insert
  // (recibe la tx del caller, ver ProductsService.create/StoresService.create)
  // para que el conteo y el alta no queden separados en el tiempo. No cierra
  // del todo la carrera entre dos altas concurrentes bajo read-committed —
  // aceptado, ver plan de implementación §3: blindarlo del todo pediría un
  // constraint/trigger en la base y no vale la complejidad para un límite de
  // demo.
  async assertQuota(
    tx: TransactionClient,
    tenantId: string,
    kind: 'products' | 'stores',
    adding: number,
  ): Promise<void> {
    const plan = await this.getPlan(tenantId);
    if (!plan.isDemo) return;

    const max = kind === 'products' ? DEMO_PRODUCT_LIMIT : DEMO_STORE_LIMIT;
    const used =
      kind === 'products'
        ? await tx.product.count({ where: { tenantId } })
        : await tx.store.count({ where: { tenantId } });

    if (used + adding > max) {
      throw new ForbiddenException(
        kind === 'products'
          ? `La demo permite hasta ${DEMO_PRODUCT_LIMIT} productos. Registrá tu comercio para cargar el catálogo completo.`
          : `La demo permite un solo local. Registrá tu comercio para abrir sucursales.`,
      );
    }
  }

  // Variante para el import masivo (ProductsImportService.commit): a
  // diferencia de assertQuota, NO recibe una tx — se valida ANTES de abrir
  // cualquier chunk de escritura, para rechazar el archivo entero de una
  // vez en vez de escribir la mitad y cortar a mitad de camino. `adding` es
  // la cantidad de filas con action:'create' (los SKU nuevos; las que
  // actualizan un SKU existente no suman al tope).
  async assertImportQuota(tenantId: string, adding: number): Promise<void> {
    const plan = await this.getPlan(tenantId);
    if (!plan.isDemo || adding === 0) return;

    const usage = await this.usageOf(tenantId);
    if (usage.products + adding > DEMO_PRODUCT_LIMIT) {
      throw new ForbiddenException(
        `Este archivo agregaría ${adding} producto(s) nuevo(s), pero la demo permite hasta ${DEMO_PRODUCT_LIMIT} en total (ya hay ${usage.products}). Registrá tu comercio para importar el catálogo completo.`,
      );
    }
  }

  // Para GET /billing/me: cuenta el uso actual sin lanzar, para que la UI
  // muestre "12/20". Solo se llama cuando el tenant ya es demo (ver
  // SubscriptionService.toView) — un tenant standard no paga este costo.
  async usageOf(tenantId: string): Promise<{ products: number; stores: number }> {
    return withTenantContext(tenantId, async (tx) => ({
      products: await tx.product.count({ where: { tenantId } }),
      stores: await tx.store.count({ where: { tenantId } }),
    }));
  }

  limitsFor(isDemo: boolean): { maxProducts: number | null; maxStores: number | null } {
    return isDemo
      ? { maxProducts: DEMO_PRODUCT_LIMIT, maxStores: DEMO_STORE_LIMIT }
      : { maxProducts: null, maxStores: null };
  }

  // true = habilitado. Un tenant standard tiene las tres en true.
  featuresFor(isDemo: boolean): Record<PremiumFeature, boolean> {
    return {
      FISCAL_INVOICING: !isDemo,
      WOO_SYNC: !isDemo,
      TIENDANUBE_SYNC: !isDemo,
    };
  }
}
