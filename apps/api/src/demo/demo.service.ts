import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, randomBytes, randomInt } from 'crypto';
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
import { MailerService } from '../common/mailer/mailer.service';
import { renderBrandedEmail } from '../common/mailer/email-template';

const BCRYPT_ROUNDS = 12;
const DEMO_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  private get maxLiveDemos(): number {
    const raw = Number(this.config.get('DEMO_MAX_LIVE') ?? 200);
    return Number.isFinite(raw) && raw > 0 ? raw : 200;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  // Paso 1 de 2: nada se crea en la base todavía a propósito (decisión de
  // producto) — un email que pide el código y nunca lo confirma no deja
  // ningún tenant suelto ni cuenta para DEMO_MAX_LIVE. Solo queda la fila de
  // verificación (que igual expira sola y se limpia en DemoPurgeService).
  async requestCode(rawEmail: string): Promise<{ debugCode?: string }> {
    const email = this.normalizeEmail(rawEmail);
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);

    // Un email solo tiene UN código vigente a la vez — pedir uno nuevo
    // invalida cualquier pedido anterior sin usar (evita acumular filas y
    // evita que un código viejo, ya mostrado a otra persona con acceso al
    // mail, siga siendo válido).
    await prisma.demoVerificationRequest.deleteMany({ where: { email } });
    await prisma.demoVerificationRequest.create({
      data: { email, codeHash, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    });

    const sent = await this.mailer.send({
      to: email,
      subject: 'Tu código para probar el POS',
      context: 'el código de verificación de la demo',
      text: `Tu código es ${code}. Vence en 10 minutos.\n\nSi no pediste esto, ignorá este mensaje.`,
      html: renderBrandedEmail({
        heading: 'Tu código para probar Vende Nube',
        bodyHtml: `
          <p style="margin:0 0 16px;">Usá este código para confirmar tu email y entrar a la demo:</p>
          <p style="margin:0; text-align:center;">
            <span style="display:inline-block; padding:14px 24px; background-color:#f3f1f8; border-radius:8px; font-size:28px; font-weight:bold; letter-spacing:6px; color:#1c1b1f; font-family:'Courier New',monospace;">${code}</span>
          </p>
        `,
        footNote: 'Vence en 10 minutos.',
      }),
    });

    // Sin SMTP configurado (dev local sin credenciales) el código no llega
    // a ningún lado — se loguea para poder probar el flujo igual. Nunca en
    // producción con mailer configurado: ahí `sent` es true y esta línea no
    // corre.
    if (!sent) {
      this.logger.warn(`[DEV] Código de demo para ${email}: ${code}`);
    }

    // THROTTLE_DISABLE_FOR_TESTS ya es el flag que este repo usa para
    // comportamiento exclusivo de la suite e2e (ver
    // test/jest-e2e.setup.ts / AppThrottlerGuard) — se reusa acá en vez de
    // inventar uno nuevo. Nunca es 'true' fuera de tests, así que el código
    // nunca viaja en la respuesta en un despliegue real.
    if (process.env.THROTTLE_DISABLE_FOR_TESTS === 'true') {
      return { debugCode: code };
    }
    return {};
  }

  // Paso 2 de 2: valida el código y recién ahí decide qué hacer. Si ese
  // email YA tiene un tenant demo (vencido o no — mientras no lo hayan
  // purgado), reingresa a ESE mismo tenant en vez de crear uno nuevo: "un
  // email = una demo viva a la vez", decisión de producto. Si no, provisiona
  // uno nuevo (mismo camino que la versión anterior de este método).
  async verifyCode(rawEmail: string, code: string): Promise<DemoStartResponse> {
    const email = this.normalizeEmail(rawEmail);

    const request = await prisma.demoVerificationRequest.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
    if (!request || request.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'El código venció o no existe. Pedí uno nuevo.',
      );
    }
    if (request.attempts >= MAX_CODE_ATTEMPTS) {
      await prisma.demoVerificationRequest.delete({
        where: { id: request.id },
      });
      throw new BadRequestException(
        'Demasiados intentos con este código. Pedí uno nuevo.',
      );
    }

    const valid = await bcrypt.compare(code, request.codeHash);
    if (!valid) {
      // Se incrementa ANTES de tirar la excepción — si no, alguien podría
      // reintentar indefinidamente aprovechando que la request falla antes
      // de persistir el intento.
      await prisma.demoVerificationRequest.update({
        where: { id: request.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Código incorrecto.');
    }

    // Código correcto: de un solo uso, se borra ya mismo.
    await prisma.demoVerificationRequest.delete({ where: { id: request.id } });

    const existing = await this.findLiveDemoTenant(email);
    if (existing) return this.reissueSession(existing);
    return this.provision(email);
  }

  private async findLiveDemoTenant(email: string) {
    return withPlatformContext((tx) =>
      tx.tenant.findFirst({ where: { planTier: 'demo', contactEmail: email } }),
    );
  }

  // Re-loguea al dueño de un tenant demo ya existente — no crea nada. Si
  // venció, igual devuelve tokens válidos: el login funciona siempre (está
  // en ALWAYS_ALLOWED_PREFIXES vía /demo), es SubscriptionEnforcementInterceptor
  // quien lo va a frenar en el resto de la API y mostrarle DemoExpiredGate.
  private async reissueSession(tenant: {
    id: string;
    demoExpiresAt: Date | null;
  }): Promise<DemoStartResponse> {
    const user = await withTenantContext(tenant.id, (tx) =>
      tx.user.findFirst({
        where: { tenantId: tenant.id, role: UserRole.OWNER },
      }),
    );
    if (!user) {
      // No debería pasar nunca (todo tenant demo tiene su OWNER sembrado al
      // crearse, y se borran juntos en la purga) — si pasara, es un dato
      // inconsistente que hay que investigar, no algo para tapar creando un
      // segundo tenant para el mismo email (rompería la garantía de "una
      // demo viva por mail").
      this.logger.error(
        `Tenant demo ${tenant.id} sin usuario OWNER — dato inconsistente.`,
      );
      throw new BadRequestException(
        'Hubo un problema con tu demo existente. Contactanos para resolverlo.',
      );
    }

    const tokens = await this.authService.generateTokens(user);
    this.logger.log(`Re-login a demo existente: tenant=${tenant.id}`);

    return {
      user: {
        id: user.id,
        tenantId: tenant.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      tokens,
      demoExpiresAt: (tenant.demoExpiresAt ?? new Date()).toISOString(),
    };
  }

  // Provisiona un tenant demo completo: Tenant + Store + User OWNER +
  // catálogo de ejemplo, y devuelve tokens ya logueados. Ya no genera
  // contraseña: con la verificación por código, volver a entrar es siempre
  // "pedí un código nuevo a este mail" — no hay nada que recordar ni
  // guardar. passwordHash igual existe porque el campo de User lo pide, pero
  // es un valor descartable que nunca se muestra ni se usa para loguear.
  //
  // Se parte en DOS transacciones (a diferencia de registerTenant, que hace
  // todo en una): el timeout interactivo de Prisma es 5s, y sembrar ~30 filas
  // de catálogo de ejemplo además de crear tenant/store/user arriesga
  // pisarlo bajo carga. bcrypt corre AFUERA de ambas, igual que en
  // AuthService.registerTenant.
  private async provision(email: string): Promise<DemoStartResponse> {
    await this.assertUnderCap();

    const tenantId = randomUUID();
    const now = new Date();
    const demoExpiresAt = new Date(now.getTime() + DEMO_LIFETIME_MS);
    const throwawayPassword = randomBytes(18).toString('base64url');
    const passwordHash = await bcrypt.hash(throwawayPassword, BCRYPT_ROUNDS);
    const shortId = tenantId.slice(0, 8);

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
          // El email YA está verificado en este punto (verifyCode corrió
          // antes de llegar acá) — es lo que permite reconocer "una demo
          // viva para este mail" en el próximo pedido de código.
          contactEmail: email,
        },
      });

      const store = await tx.store.create({
        data: { tenantId, name: 'Local Demo' },
      });

      const createdUser = await tx.user.create({
        data: {
          tenantId,
          email: `demo-${shortId}@demo.local`,
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

    this.logger.log(
      `Demo provisionada: tenant=${tenantId} expira=${demoExpiresAt.toISOString()}`,
    );

    return {
      user: {
        id: user.id,
        tenantId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      tokens,
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
