import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

interface AuthResponseBody {
  tokens: { accessToken: string; refreshToken: string };
}

// Único archivo de la suite e2e que corre CON throttling real activado
// (ver test/jest-e2e.setup.ts, que lo desactiva por defecto para todos los
// demás *.e2e-spec.ts) — necesita el comportamiento de producción para
// poder verificar el 429.
describe('Auth security (Sprint 9) — e2e', () => {
  let app: INestApplication<App>;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    process.env.THROTTLE_DISABLE_FOR_TESTS = 'false';

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
    process.env.THROTTLE_DISABLE_FOR_TESTS = 'true';
    await app.close();
  });

  async function registerTenant(email: string): Promise<AuthResponseBody> {
    const res = await request(app.getHttpServer())
      .post('/auth/register-tenant')
      .send({
        tenantName: `Tenant Security ${suffix}`,
        storeName: 'Local Test',
        ownerFullName: 'Owner Test',
        ownerEmail: email,
        ownerPassword: 'password123',
      })
      .expect(201);
    return res.body as AuthResponseBody;
  }

  it('rota el refresh token en cada uso, y el token ya usado dispara detección de reuso que cierra toda la sesión', async () => {
    const initial = await registerTenant(`rotation-${suffix}@test.com`);
    const oldRefreshToken = initial.tokens.refreshToken;

    // Primer uso: rota correctamente a un par nuevo.
    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(200);
    const rotatedBody = rotated.body as AuthResponseBody['tokens'];
    expect(rotatedBody.refreshToken).not.toBe(oldRefreshToken);

    // Reuso del token viejo (ya rotado) -> detectado como robo/reuso.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);

    // La detección de reuso cierra TODA la familia de sesiones del
    // usuario — incluso el token nuevo, legítimo, emitido en la rotación
    // de arriba, deja de servir.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: rotatedBody.refreshToken })
      .expect(401);
  });

  it('logout revoca la sesión en base de datos: el refresh token deja de servir después', async () => {
    const session = await registerTenant(`logout-${suffix}@test.com`);
    const { refreshToken } = session.tokens;

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('logout es idempotente: llamarlo dos veces no rompe nada', async () => {
    const session = await registerTenant(`logout-idem-${suffix}@test.com`);
    const { refreshToken } = session.tokens;

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken })
      .expect(200);
  });

  // Los dos tests de abajo van al final a propósito: agotan el budget de
  // rate limiting de /auth/login y /auth/register-tenant (5/min) para el
  // resto de la suite. Se hace en un loop hasta ver un 429 en vez de asumir
  // un número exacto de intentos previos — así el test no es frágil ante
  // cuántas llamadas ya consumieron el budget los tests de arriba.
  it('bloquea con 429 tras demasiados intentos de login en la ventana de 1 minuto', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `no-existe-${suffix}@test.com`,
          password: 'wrong-password',
        });
      statuses.push(res.status);
      if (res.status === 429) break;
    }

    expect(statuses).toContain(429);
    expect(statuses[0]).not.toBe(429); // el primer intento no debe bloquearse de entrada
  });

  it('bloquea con 429 tras demasiados intentos de alta de tenant en la ventana de 1 minuto', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/register-tenant')
        .send({
          tenantName: `Tenant Flood ${suffix} ${i}`,
          storeName: 'Local Test',
          ownerFullName: 'Owner Test',
          ownerEmail: `flood-${suffix}-${i}@test.com`,
          ownerPassword: 'password123',
        });
      statuses.push(res.status);
      if (res.status === 429) break;
    }

    expect(statuses).toContain(429);
  });
});
