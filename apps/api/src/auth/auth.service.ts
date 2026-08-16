import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_TTL = '7d';
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
  ) {}

  // Crea el Tenant, su primer Store y el usuario OWNER en una única
  // transacción. El session var de RLS (app.tenant_id) se setea recién
  // después de crear el Tenant y antes de insertar Store/User — esas tablas
  // tienen FORCE ROW LEVEL SECURITY, así que el INSERT sería rechazado por
  // la política si no está seteado. Ver prisma/migrations/..._enable_row_level_security.
  async registerTenant(
    dto: RegisterTenantDto,
  ): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    const passwordHash = await bcrypt.hash(dto.ownerPassword, BCRYPT_ROUNDS);

    const user = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.tenantName, slug: slugify(dto.tenantName) },
      });

      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;

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

    return this.generateTokens(user);
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
        { sub: user.id, tenantId: user.tenantId },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: REFRESH_TOKEN_TTL,
        },
      ),
    ]);

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
