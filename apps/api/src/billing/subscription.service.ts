import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  withTenantContext,
  withPlatformContext,
  Prisma,
  type SubscriptionStatus,
  type Tenant,
} from '@pos/database';
import {
  resolveSubscription,
  type SubscriptionConfig,
  type SubscriptionSnapshot,
} from './subscription-status.util';
import { PlanService, type PremiumFeature } from './plan.service';

const DEFAULT_TRIAL_DAYS = 30;
const DEFAULT_GRACE_DAYS = 10;
const DEFAULT_WARN_BEFORE_DAYS = 7;

export interface PlanView {
  tier: 'standard' | 'demo';
  isDemo: boolean;
  demoExpiresAt: string | null;
  demoDaysRemaining: number | null;
  features: Record<PremiumFeature, boolean>;
  limits: { maxProducts: number | null; maxStores: number | null };
  usage: { products: number; stores: number } | null;
}

export interface TenantSubscriptionView {
  tenantId: string;
  tenantName: string;
  contactEmail: string | null;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  monthlyAmount: number | null;
  enforcementPolicy: Tenant['enforcementPolicy'];
  hasMercadoPagoSubscription: boolean;
  snapshot: SubscriptionSnapshot;
  plan: PlanView;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly planService: PlanService,
  ) {}

  // ConfigService devuelve las variables de entorno como STRING. Sin este
  // Number() explícito, trialEndsAtFromNow haría `getDate() + "30"`, que en
  // JavaScript concatena en vez de sumar ("1730") y daría un período de
  // prueba de 1730 días. Se valida además que sea finito y no negativo: una
  // variable mal escrita en el .env debe caer al default, no romper el alta
  // de un comercio ni regalarle años de servicio.
  private numericConfig(key: string, fallback: number): number {
    const raw = this.config.get<string | number>(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      this.logger.warn(
        `${key} tiene un valor inválido ("${String(raw)}") — se usa el default ${fallback}`,
      );
      return fallback;
    }
    return parsed;
  }

  get trialDays(): number {
    return this.numericConfig('BILLING_TRIAL_DAYS', DEFAULT_TRIAL_DAYS);
  }

  get statusConfig(): SubscriptionConfig {
    return {
      graceDays: this.numericConfig('BILLING_GRACE_DAYS', DEFAULT_GRACE_DAYS),
      warnBeforeDays: this.numericConfig(
        'BILLING_WARN_BEFORE_DAYS',
        DEFAULT_WARN_BEFORE_DAYS,
      ),
    };
  }

  snapshotOf(tenant: Tenant, now = new Date()): SubscriptionSnapshot {
    return resolveSubscription(
      {
        subscriptionStatus: tenant.subscriptionStatus,
        trialEndsAt: tenant.trialEndsAt,
        currentPeriodEnd: tenant.currentPeriodEnd,
        enforcementPolicy: tenant.enforcementPolicy,
      },
      this.statusConfig,
      now,
    );
  }

  // withUsage=true cuenta productos/locales del tenant (dos queries extra) —
  // solo tiene sentido para el propio comercio viendo su GET /billing/me.
  // Las vistas de plataforma (listAllTenants, getTenantForPlatform) pasan
  // false: no tiene sentido pagar ese costo en una lista de N comercios, y
  // la UI de /platform no muestra "12/20" en ningún lado.
  async toView(tenant: Tenant, withUsage = false): Promise<TenantSubscriptionView> {
    const isDemo = tenant.planTier === 'demo';
    const usage = withUsage && isDemo
      ? await this.planService.usageOf(tenant.id)
      : null;

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      contactEmail: tenant.contactEmail,
      subscriptionStatus: tenant.subscriptionStatus,
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: tenant.currentPeriodEnd?.toISOString() ?? null,
      monthlyAmount: tenant.monthlyAmount ? Number(tenant.monthlyAmount) : null,
      enforcementPolicy: tenant.enforcementPolicy,
      hasMercadoPagoSubscription: Boolean(tenant.mpPreapprovalId),
      snapshot: this.snapshotOf(tenant),
      plan: {
        tier: isDemo ? 'demo' : 'standard',
        isDemo,
        demoExpiresAt: tenant.demoExpiresAt?.toISOString() ?? null,
        demoDaysRemaining: isDemo && tenant.demoExpiresAt
          ? Math.max(0, Math.ceil((tenant.demoExpiresAt.getTime() - Date.now()) / 86_400_000))
          : null,
        features: this.planService.featuresFor(isDemo),
        limits: this.planService.limitsFor(isDemo),
        usage,
      },
    };
  }

  // Lo que ve el propio comercio sobre su suscripción. Va por el contexto de
  // tenant normal: la fila de Tenant ya le es visible por RLS, no hace falta
  // ningún privilegio de plataforma. Con uso: es el único lugar que necesita
  // mostrar "12/20 productos".
  async getOwnSubscription(tenantId: string): Promise<TenantSubscriptionView> {
    const tenant = await withTenantContext(tenantId, (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId } }),
    );
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return this.toView(tenant, true);
  }

  async listOwnEvents(tenantId: string, limit = 24) {
    return withTenantContext(tenantId, (tx) =>
      tx.subscriptionEvent.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    );
  }

  // ── Plataforma (SUPERADMIN) ───────────────────────────────────────────────

  async listAllTenants(): Promise<TenantSubscriptionView[]> {
    const tenants = await withPlatformContext((tx) =>
      tx.tenant.findMany({ orderBy: { createdAt: 'desc' } }),
    );
    return Promise.all(tenants.map((t) => this.toView(t)));
  }

  async getTenantForPlatform(tenantId: string): Promise<Tenant> {
    const tenant = await withPlatformContext((tx) =>
      tx.tenant.findUnique({ where: { id: tenantId } }),
    );
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }

  async listEventsForPlatform(tenantId: string, limit = 50) {
    return withPlatformContext((tx) =>
      tx.subscriptionEvent.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    );
  }

  async updateFromPlatform(
    tenantId: string,
    actorEmail: string,
    patch: {
      monthlyAmount?: number;
      enforcementPolicy?: Tenant['enforcementPolicy'];
      currentPeriodEnd?: Date;
      subscriptionStatus?: SubscriptionStatus;
      notes?: string;
    },
  ): Promise<TenantSubscriptionView> {
    const updated = await withPlatformContext(async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!existing) throw new NotFoundException('Tenant no encontrado');

      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          monthlyAmount: patch.monthlyAmount,
          enforcementPolicy: patch.enforcementPolicy,
          currentPeriodEnd: patch.currentPeriodEnd,
          subscriptionStatus: patch.subscriptionStatus,
        },
      });

      // Todo cambio manual queda registrado: sin esto, dentro de seis meses
      // nadie sabe por qué un comercio tiene el vencimiento que tiene.
      await tx.subscriptionEvent.create({
        data: {
          tenantId,
          type: 'manual.update',
          status: 'applied',
          amount: patch.monthlyAmount,
          periodEnd: patch.currentPeriodEnd,
          notes: `Por ${actorEmail}${patch.notes ? ` — ${patch.notes}` : ''}`,
          payload: patch,
        },
      });

      return tenant;
    });

    return this.toView(updated);
  }

  // ── Aplicación de eventos de Mercado Pago ────────────────────────────────

  async findTenantByPreapproval(preapprovalId: string): Promise<Tenant | null> {
    return withPlatformContext((tx) =>
      tx.tenant.findFirst({ where: { mpPreapprovalId: preapprovalId } }),
    );
  }

  async linkPreapproval(tenantId: string, preapprovalId: string) {
    await withTenantContext(tenantId, (tx) =>
      tx.tenant.update({
        where: { id: tenantId },
        data: { mpPreapprovalId: preapprovalId },
      }),
    );
  }

  // Cambio de estado de la suscripción (alta, pausa, baja). No mueve fechas:
  // el período pagado solo lo mueve un pago acreditado (ver applyPayment).
  async applyPreapprovalStatus(params: {
    tenantId: string;
    preapprovalId: string;
    mpStatus: string;
    payload: unknown;
  }): Promise<void> {
    const status = mapPreapprovalStatus(params.mpStatus);

    await withPlatformContext(async (tx) => {
      await tx.tenant.update({
        where: { id: params.tenantId },
        data: {
          subscriptionStatus: status,
          mpPreapprovalId: params.preapprovalId,
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          tenantId: params.tenantId,
          type: 'mp.subscription_preapproval',
          status: params.mpStatus,
          notes: `Suscripción ${params.preapprovalId} → ${params.mpStatus}`,
          payload: params.payload as Prisma.InputJsonValue,
        },
      });
    });
  }

  // Acredita un pago y empuja currentPeriodEnd un mes.
  //
  // IDEMPOTENCIA: Mercado Pago reintenta los webhooks, así que este método se
  // puede llamar varias veces con el mismo mpPaymentId. La unicidad de esa
  // columna es la que garantiza que el período se extienda UNA sola vez: si
  // el insert choca con P2002, ya se procesó y se sale sin tocar el tenant.
  async applyPayment(params: {
    tenantId: string;
    mpPaymentId: string;
    amount: number | null;
    status: string;
    payload: unknown;
  }): Promise<{ applied: boolean }> {
    const approved =
      params.status === 'approved' || params.status === 'accredited';

    try {
      return await withPlatformContext(async (tx) => {
        const tenant = await tx.tenant.findUnique({
          where: { id: params.tenantId },
        });
        if (!tenant) throw new NotFoundException('Tenant no encontrado');

        const periodEnd = approved
          ? addOneMonth(maxDate(tenant.currentPeriodEnd, new Date()))
          : null;

        // Este insert es la barrera de idempotencia — va primero a propósito,
        // para que si choca no se haya tocado nada del tenant todavía.
        await tx.subscriptionEvent.create({
          data: {
            tenantId: params.tenantId,
            type: 'mp.payment',
            status: params.status,
            amount: params.amount,
            mpPaymentId: params.mpPaymentId,
            periodEnd,
            payload: params.payload as Prisma.InputJsonValue,
          },
        });

        if (approved && periodEnd) {
          await tx.tenant.update({
            where: { id: params.tenantId },
            data: {
              currentPeriodEnd: periodEnd,
              subscriptionStatus: 'ACTIVE',
            },
          });
        } else if (!approved) {
          await tx.tenant.update({
            where: { id: params.tenantId },
            data: { subscriptionStatus: 'PAST_DUE' },
          });
        }

        return { applied: true };
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.log(
          `Pago ${params.mpPaymentId} ya estaba procesado — webhook duplicado ignorado`,
        );
        return { applied: false };
      }
      throw err;
    }
  }

  // Usado por AuthService al dar de alta un tenant. No usa withTenantContext
  // porque corre dentro de la transacción de alta, que ya seteó app.tenant_id.
  trialEndsAtFromNow(now = new Date()): Date {
    const end = new Date(now);
    end.setDate(end.getDate() + this.trialDays);
    return end;
  }
}

function mapPreapprovalStatus(mpStatus: string): SubscriptionStatus {
  switch (mpStatus) {
    case 'authorized':
      return 'ACTIVE';
    case 'paused':
      return 'PAST_DUE';
    case 'cancelled':
      return 'CANCELLED';
    default:
      // 'pending' u otro: todavía no adhirió la tarjeta, sigue como estaba.
      return 'TRIAL';
  }
}

function maxDate(a: Date | null, b: Date): Date {
  if (!a) return b;
  return a.getTime() > b.getTime() ? a : b;
}

// Suma un mes calendario. setMonth ya normaliza el desborde (31 de enero + 1
// mes = 2 o 3 de marzo), que es el comportamiento aceptable acá: nunca
// acorta un período pagado.
function addOneMonth(from: Date): Date {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}
