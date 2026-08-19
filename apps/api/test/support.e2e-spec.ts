import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { prisma, withAuthLookupContext, withPlatformContext, UserRole } from '@pos/database';

interface AuthResponseBody {
  tokens: { accessToken: string };
}
interface DemoStartBody {
  tokens: { accessToken: string };
}
interface MessageResponseBody {
  id: string;
  category: string;
  status: string;
  contactEmail: string;
  tenantId: string | null;
}
interface ApiErrorBody {
  message: string | string[];
}

// Corre contra la base de datos real local, igual que los demás e2e-spec de
// este proyecto — no se limpia después (dev/CI descartable, nunca prod).
describe('Support messages (soporte / venta) — e2e', () => {
  let app: INestApplication<App>;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function registerTenant(name: string, email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register-tenant')
      .send({
        tenantName: `${name} ${suffix}`,
        storeName: 'Local Test',
        ownerFullName: 'Owner Test',
        ownerEmail: email,
        ownerPassword: 'password123',
      })
      .expect(201);
    return {
      auth: {
        Authorization: `Bearer ${(res.body as AuthResponseBody).tokens.accessToken}`,
      },
    };
  }

  async function startDemo() {
    const res = await request(app.getHttpServer())
      .post('/demo/start')
      .send({})
      .expect(201);
    return {
      auth: {
        Authorization: `Bearer ${(res.body as DemoStartBody).tokens.accessToken}`,
      },
    };
  }

  // No hay alta self-service de SUPERADMIN (ver docs/deployment.md §3 bis.2 —
  // en producción se crea por SQL directo). Acá se replica lo mismo con
  // withAuthLookupContext, el único escape hatch de RLS sobre "User" que ya
  // existe para el login — mismo motivo por el que también sirve para esta
  // inserción con tenantId NULL.
  async function createSuperadmin(email: string) {
    const passwordHash = await bcrypt.hash('password123', 12);
    await withAuthLookupContext((tx) =>
      tx.user.create({
        data: {
          id: randomUUID(),
          tenantId: null,
          email,
          passwordHash,
          fullName: 'Staff Test',
          role: UserRole.SUPERADMIN,
        },
      }),
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return {
      auth: {
        Authorization: `Bearer ${(login.body as AuthResponseBody).tokens.accessToken}`,
      },
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('un usuario logueado crea un mensaje, con su contacto resuelto del JWT', async () => {
    const tenant = await registerTenant(
      'Tenant Support',
      `tenant-support-${suffix}@test.com`,
    );

    const res = await request(app.getHttpServer())
      .post('/support/messages')
      .set(tenant.auth)
      .send({ category: 'TECHNICAL', subject: 'Duda', message: 'No me anda el X' })
      .expect(201);
    const body = res.body as MessageResponseBody;
    expect(body.category).toBe('TECHNICAL');
    expect(body.status).toBe('OPEN');
    expect(body.contactEmail).toContain(`tenant-support-${suffix}`);
    expect(body.tenantId).not.toBeNull();
  });

  it('sin sesión, 401', async () => {
    await request(app.getHttpServer())
      .post('/support/messages')
      .send({ category: 'TECHNICAL', message: 'Hola' })
      .expect(401);
  });

  it('un tenant demo BLOQUEADO igual puede mandar "quiero pasar a Premium" — es su única salida', async () => {
    const demo = await startDemo();

    // Bloquear manualmente en vez de esperar 7 días.
    const meBefore = await request(app.getHttpServer())
      .get('/billing/me')
      .set(demo.auth)
      .expect(200);
    const tenantId = (meBefore.body as { tenantId: string }).tenantId;
    await withPlatformContext((tx) =>
      tx.tenant.update({
        where: { id: tenantId },
        data: { demoExpiresAt: new Date(Date.now() - 1000) },
      }),
    );

    // Confirma que SÍ está bloqueado para todo lo demás.
    await request(app.getHttpServer())
      .get('/products')
      .set(demo.auth)
      .expect(403);

    // Pero /support/messages sigue andando.
    await request(app.getHttpServer())
      .post('/support/messages')
      .set(demo.auth)
      .send({ category: 'PREMIUM_INTEREST', message: 'Quiero pagar' })
      .expect(201);
  });

  it('validación: category inválida da 400', async () => {
    const tenant = await registerTenant(
      'Tenant Support Invalid',
      `tenant-support-invalid-${suffix}@test.com`,
    );
    const res = await request(app.getHttpServer())
      .post('/support/messages')
      .set(tenant.auth)
      .send({ category: 'NO_EXISTE', message: 'Hola' })
      .expect(400);
    expect((res.body as ApiErrorBody).message).toBeDefined();
  });

  it('un OWNER normal no puede listar ni resolver mensajes — 403', async () => {
    const tenant = await registerTenant(
      'Tenant Support NoAdmin',
      `tenant-support-noadmin-${suffix}@test.com`,
    );
    await request(app.getHttpServer())
      .get('/platform/support-messages')
      .set(tenant.auth)
      .expect(403);
  });

  it('un SUPERADMIN lista y resuelve mensajes de cualquier tenant', async () => {
    const tenant = await registerTenant(
      'Tenant Support Platform',
      `tenant-support-platform-${suffix}@test.com`,
    );
    const created = await request(app.getHttpServer())
      .post('/support/messages')
      .set(tenant.auth)
      .send({ category: 'PREMIUM_INTEREST', message: 'Quiero el plan pago' })
      .expect(201);
    const messageId = (created.body as MessageResponseBody).id;

    const staff = await createSuperadmin(`staff-support-${suffix}@test.com`);

    const listRes = await request(app.getHttpServer())
      .get('/platform/support-messages')
      .set(staff.auth)
      .expect(200);
    const list = listRes.body as MessageResponseBody[];
    expect(list.some((m) => m.id === messageId)).toBe(true);

    const openOnly = await request(app.getHttpServer())
      .get('/platform/support-messages')
      .query({ status: 'OPEN' })
      .set(staff.auth)
      .expect(200);
    expect(
      (openOnly.body as MessageResponseBody[]).every((m) => m.status === 'OPEN'),
    ).toBe(true);

    const resolved = await request(app.getHttpServer())
      .patch(`/platform/support-messages/${messageId}/resolve`)
      .set(staff.auth)
      .expect(200);
    expect((resolved.body as MessageResponseBody).status).toBe('RESOLVED');

    await request(app.getHttpServer())
      .patch('/platform/support-messages/no-existe/resolve')
      .set(staff.auth)
      .expect(404);
  });
});
