import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

interface AuthResponseBody {
  tokens: { accessToken: string };
}
interface IdResponseBody {
  id: string;
}
interface ShiftBody {
  id: string;
  status: string;
  initialAmount: string;
  actualCash: string | null;
  expectedCash: string | null;
  difference: string | null;
}
interface SummaryBody {
  totalInflows: number;
  totalOutflows: number;
  expectedCash: number;
}

// Corre contra la base de datos real local, igual que catalog.e2e-spec.ts —
// no se limpia después (dev/CI descartable, nunca producción).
describe('Cash shifts (Sprint 4) — e2e', () => {
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
    const { accessToken } = (res.body as AuthResponseBody).tokens;

    const storesRes = await request(app.getHttpServer())
      .get('/stores')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const stores = storesRes.body as IdResponseBody[];

    return { token: accessToken, storeId: stores[0].id };
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
  });

  it('bloquea abrir un segundo turno en la misma caja mientras el primero sigue abierto', async () => {
    const tenant = await registerTenant(
      'Tenant Cajas',
      `cajas-${suffix}@test.com`,
    );
    const auth = { Authorization: `Bearer ${tenant.token}` };

    const registerRes = await request(app.getHttpServer())
      .post('/cash-registers')
      .set(auth)
      .send({ storeId: tenant.storeId, name: 'Caja 1' })
      .expect(201);
    const cashRegisterId = (registerRes.body as IdResponseBody).id;

    await request(app.getHttpServer())
      .post('/cash-shifts/open')
      .set(auth)
      .send({ cashRegisterId, initialAmount: 1000 })
      .expect(201);

    const currentRes = await request(app.getHttpServer())
      .get(`/cash-shifts/current?cashRegisterId=${cashRegisterId}`)
      .set(auth)
      .expect(200);
    expect((currentRes.body as ShiftBody).status).toBe('OPEN');

    await request(app.getHttpServer())
      .post('/cash-shifts/open')
      .set(auth)
      .send({ cashRegisterId, initialAmount: 500 })
      .expect(409);
  });

  it('registra movimientos manuales y calcula el saldo esperado correctamente', async () => {
    const tenant = await registerTenant(
      'Tenant Movimientos',
      `movs-${suffix}@test.com`,
    );
    const auth = { Authorization: `Bearer ${tenant.token}` };

    const registerRes = await request(app.getHttpServer())
      .post('/cash-registers')
      .set(auth)
      .send({ storeId: tenant.storeId, name: 'Caja Movimientos' })
      .expect(201);
    const cashRegisterId = (registerRes.body as IdResponseBody).id;

    const openRes = await request(app.getHttpServer())
      .post('/cash-shifts/open')
      .set(auth)
      .send({ cashRegisterId, initialAmount: 1000 })
      .expect(201);
    const shiftId = (openRes.body as IdResponseBody).id;

    await request(app.getHttpServer())
      .post(`/cash-shifts/${shiftId}/movements`)
      .set(auth)
      .send({ type: 'INFLOW', amount: 500, reason: 'Cambio adicional' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/cash-shifts/${shiftId}/movements`)
      .set(auth)
      .send({ type: 'OUTFLOW', amount: 200, reason: 'Pago a proveedor' })
      .expect(201);

    const movementsRes = await request(app.getHttpServer())
      .get(`/cash-shifts/${shiftId}/movements`)
      .set(auth)
      .expect(200);
    expect(movementsRes.body).toHaveLength(2);

    const summaryRes = await request(app.getHttpServer())
      .get(`/cash-shifts/${shiftId}/summary`)
      .set(auth)
      .expect(200);
    const summary = summaryRes.body as SummaryBody;

    // 1000 (inicial) + 500 (ingreso) - 200 (egreso) = 1300
    expect(summary.totalInflows).toBe(500);
    expect(summary.totalOutflows).toBe(200);
    expect(summary.expectedCash).toBe(1300);
  });

  it('cierra el turno calculando la diferencia exacta y libera la caja', async () => {
    const tenant = await registerTenant(
      'Tenant Cierre',
      `cierre-${suffix}@test.com`,
    );
    const auth = { Authorization: `Bearer ${tenant.token}` };

    const registerRes = await request(app.getHttpServer())
      .post('/cash-registers')
      .set(auth)
      .send({ storeId: tenant.storeId, name: 'Caja Cierre' })
      .expect(201);
    const cashRegisterId = (registerRes.body as IdResponseBody).id;

    const openRes = await request(app.getHttpServer())
      .post('/cash-shifts/open')
      .set(auth)
      .send({ cashRegisterId, initialAmount: 1000 })
      .expect(201);
    const shiftId = (openRes.body as IdResponseBody).id;

    await request(app.getHttpServer())
      .post(`/cash-shifts/${shiftId}/movements`)
      .set(auth)
      .send({ type: 'INFLOW', amount: 300, reason: 'Ingreso' })
      .expect(201);

    // esperado = 1000 + 300 = 1300; contamos 1250 -> faltante de 50
    const closeRes = await request(app.getHttpServer())
      .post(`/cash-shifts/${shiftId}/close`)
      .set(auth)
      .send({ actualCash: 1250, notes: 'Faltante detectado en arqueo' })
      .expect(201);
    const closed = closeRes.body as ShiftBody;

    expect(closed.status).toBe('CLOSED');
    expect(Number(closed.expectedCash)).toBe(1300);
    expect(Number(closed.actualCash)).toBe(1250);
    expect(Number(closed.difference)).toBe(-50);

    // no se pueden agregar movimientos a un turno cerrado
    await request(app.getHttpServer())
      .post(`/cash-shifts/${shiftId}/movements`)
      .set(auth)
      .send({ type: 'INFLOW', amount: 10, reason: 'no debería aplicar' })
      .expect(400);

    // no se puede cerrar dos veces
    await request(app.getHttpServer())
      .post(`/cash-shifts/${shiftId}/close`)
      .set(auth)
      .send({ actualCash: 1300 })
      .expect(400);

    // la caja quedó liberada: se puede abrir un turno nuevo
    await request(app.getHttpServer())
      .post('/cash-shifts/open')
      .set(auth)
      .send({ cashRegisterId, initialAmount: 800 })
      .expect(201);
  });
});
