import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  prisma,
  withTenantContext,
  withAuthLookupContext,
  UserRole,
  type User,
} from '@pos/database';
import type { RegisterTenantDto } from './dto/register-tenant.dto';
import type { LoginDto } from './dto/login.dto';
import { hashRefreshToken } from './token-hash.util';
import { SubscriptionService } from '../billing/subscription.service';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_TTL = '7d';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DIACRITICS_REGEX = /[̀-ͯ]/g;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser {
  id: string;
  tenantId: string | null;
  email: string;
  fullName: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  // Crea el Tenant, su primer Store y el usuario OWNER en una única
  // transacción. "Tenant" también tiene FORCE ROW LEVEL SECURITY (Sprint 9)
  // usando su propio id como límite — así que a diferencia de Store/User
  // (donde el session var ya está seteado antes del insert), acá hay que
  // pre-generar el id del tenant Y setear app.tenant_id ANTES del insert:
  // si no, el WITH CHECK de la política rechaza el INSERT porque todavía no
  // hay ningún tenant_id en la sesión. Ver prisma/migrations/
  // ..._security_hardening.
  async registerTenant(
    dto: RegisterTenantDto,
  ): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const passwordHash = await bcrypt.hash(dto.ownerPassword, BCRYPT_ROUNDS);
    const tenantId = randomUUID();

    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      const tenant = await tx.tenant.create({
        data: {
          id: tenantId,
          name: dto.tenantName,
          slug: slugify(dto.tenantName),
          // Todo comercio nuevo arranca con período de prueba; el contador se
          // le muestra en el banner desde el primer día. contactEmail es la
          // copia que usa el panel de plataforma para saber a quién
          // reclamarle sin leer "User" cross-tenant (ahí vive passwordHash).
          trialEndsAt: this.subscriptionService.trialEndsAtFromNow(),
          contactEmail: dto.ownerEmail,
        },
      });

      await tx.store.create({
        data: { tenantId: tenant.id, name: dto.storeName },
      });

      return tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.ownerEmail,
          passwordHash,
          fullName: dto.ownerFullName,
          role: UserRole.OWNER,
        },
      });
    });

    return { user: toSafeUser(user), tokens: await this.generateTokens(user) };
  }

  async login(dto: LoginDto): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const user = await withAuthLookupContext((tx) =>
      tx.user.findUnique({ where: { email: dto.email } }),
    );
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return { user: toSafeUser(user), tokens: await this.generateTokens(user) };
  }

  // Rotación con detección de reuso: cada refresh token solo sirve una vez
  // (RTBF — Refresh Token Break Frequency / rotation). Si alguien roba un
  // refresh token viejo y lo usa después de que el usuario legítimo ya lo
  // rotó, la fila ya está isRevoked=true acá — eso es la señal de robo, no
  // solo de un token vencido, así que la respuesta no es "pedí uno nuevo"
  // sino "cerrar todas las sesiones de este usuario" (ver revokeAllForUser).
  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string; tenantId: string | null };
    try {
      payload = await this.jwtService.verifyAsync<{
        sub: string;
        tenantId: string | null;
      }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o vencido');
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido o vencido');
    }
    if (stored.isRevoked) {
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException(
        'Reuso de refresh token detectado — se cerraron todas las sesiones por seguridad',
      );
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido o vencido');
    }

    // El refresh token ya trae tenantId (ver generateTokens) para poder
    // buscar al usuario sin necesitar el bypass de RLS del login.
    const user = payload.tenantId
      ? await withTenantContext(payload.tenantId, (tx) =>
          tx.user.findUnique({ where: { id: payload.sub } }),
        )
      : await withAuthLookupContext((tx) =>
          tx.user.findUnique({ where: { id: payload.sub } }),
        );

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inválido');
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    return this.generateTokens(user);
  }

  // Revoca la sesión activa asociada a este refresh token puntual — no
  // requiere validar la firma/vencimiento del JWT: para cerrar sesión
  // alcanza con poseer el string del token (es la misma lógica que un
  // logout de sesión por cookie, no una operación que necesite "confiar"
  // en el payload). Idempotente y sin filtrar si el token existía o no.
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  private async generateTokens(user: User): Promise<AuthTokens> {
    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(
        // jti aleatorio: la firma HMAC es determinística, así que dos
        // refresh tokens para el mismo usuario emitidos en el mismo
        // segundo (mismo iat) con el mismo payload serían el string JWT
        // idéntico byte a byte -> mismo tokenHash -> choca contra el
        // @unique de RefreshToken. Pasa de verdad: registro seguido de un
        // refresh inmediato cae en el mismo segundo de reloj.
        { sub: user.id, tenantId: user.tenantId, jti: randomUUID() },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: REFRESH_TOKEN_TTL,
        },
      ),
    ]);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }
}

function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

// Genera un slug legible + sufijo aleatorio para evitar colisiones entre
// tenants con nombres iguales o similares (el slug es único en el schema).
function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
