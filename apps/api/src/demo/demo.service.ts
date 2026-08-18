import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  prisma,
  withPlatformContext,
  withTenantContext,
  UserRole,
} from '@pos/database';
import type { DemoStartResponse } from '@pos/shared-types';
import { AuthService, slugify } from '../auth/auth.service';
import { seedDemoData } from './demo-seed';

const BCRYPT_ROUNDS = 12;
const DEMO_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get maxLiveDemos(): number {
    const raw = Number(this.config.get('DEMO_MAX_LIVE') ?? 200);
    return Number.isFinite(raw) && raw > 0 ? raw : 200;
  }

  // Provisiona un tenant demo completo: Tenant + Store + User OWNER +
  // catálogo de ejemplo, y devuelve tokens ya logueados (misma forma que
  // AuthService.login) para que el frontend entre directo, sin pedir
  // credenciales.
  //
  // Se parte en DOS transacciones (a diferencia de registerTenant, que hace
  // todo en una): el timeout interactivo de Prisma es 5s, y sembrar ~30 filas
  // de catálogo de ejemplo además de crear tenant/store/user arriesga
  // pisarlo bajo carga. bcrypt corre AFUERA de ambas, igual que en
  // AuthService.registerTenant.
  async provision(): Promise<DemoStartResponse> {
    await this.assertUnderCap();

    const tenantId = randomUUID();
    const now = new Date();
    const demoExpiresAt = new Date(now.getTime() + DEMO_LIFETIME_MS);
    const password = randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const shortId = tenantId.slice(0, 8);
    const email = `demo-${shortId}@demo.local`;

    // tx1 — igual en forma a AuthService.registerTenant: pre-generar el id y
    // setear app.tenant_id ANTES del insert, porque Tenant tiene FORCE RLS y
    // el WITH CHECK rechaza el INSERT si la sesión todavía no tiene
    // tenant_id.
    const { user, storeId } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      await tx.tenant.create({
        data: {
          id: tenantId,
          name: `Demo ${shortId}`,
          slug: slugify(`demo-${shortId}`),
          planTier: 'demo',
          demoExpiresAt,
          // También se setea el trial comercial al mismo plazo: así
          // SubscriptionSnapshot.daysRemaining sale gratis del mismo cálculo
          // que ya usa un tenant real, sin escribir un segundo contador. La
          // fecha que manda para el borrado es demoExpiresAt, no esta — ver
          // el comentario en el schema.
          trialEndsAt: demoExpiresAt,
          contactEmail: null,
        },
      });

      const store = await tx.store.create({
        data: { tenantId, name: 'Local Demo' },
      });

      const createdUser = await tx.user.create({
        data: {
          tenantId,
          email,
          passwordHash,
          fullName: 'Cuenta Demo',
          role: UserRole.OWNER,
        },
      });

      return { user: createdUser, storeId: store.id };
    });

    // tx2 — datos de ejemplo, en el contexto RLS normal del tenant recién
    // creado (ya no hace falta el set_config manual, withTenantContext lo
    // abre de nuevo).
    await withTenantContext(tenantId, (tx) =>
      seedDemoData(tx, { tenantId, storeId }),
    );

    const tokens = await this.authService.generateTokens(user);

    this.logger.log(`Demo provisionada: tenant=${tenantId} expira=${demoExpiresAt.toISOString()}`);

    return {
      user: { id: user.id, tenantId, email: user.email, fullName: user.fullName, role: user.role },
      tokens,
      credentials: { email, password },
      demoExpiresAt: demoExpiresAt.toISOString(),
    };
  }

  // Tope global de demos vivas — la única defensa real contra que el pool
  // crezca sin límite: la creación es anónima y el throttle por IP no cubre
  // a un atacante con muchas IPs. withPlatformContext porque todavía no hay
  // ningún tenant_id de sesión en este punto (es anterior a toda la lógica
  // de alta).
  private async assertUnderCap(): Promise<void> {
    const live = await withPlatformContext((tx) =>
      tx.tenant.count({
        where: { planTier: 'demo', demoExpiresAt: { gt: new Date() } },
      }),
    );
    if (live >= this.maxLiveDemos) {
      throw new ServiceUnavailableException(
        'Hay demasiadas demos activas en este momento. Probá de nuevo en unos minutos.',
      );
    }
  }
}
