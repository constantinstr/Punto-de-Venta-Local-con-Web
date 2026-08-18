import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

interface AuthResponseBody {
  tokens: { accessToken: string };
}
interface CustomerBody {
  id: string;
  name: string;
  lastName: string | null;
  whatsapp: string | null;
  city: string | null;
  isActive: boolean;
}

// Cubre la ficha de cliente ampliada (Sprint 11): campos nuevos, búsqueda por
// apellido/WhatsApp, y baja lógica excluida del listado por defecto.
describe('Ficha de cliente ampliada — e2e', () => {
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
    return { auth: { Authorization: `Bearer ${accessToken}` } };
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

  it('da de alta un cliente con todos los campos nuevos y los edita después', async () => {
    const { auth } = await registerTenant(
      'Tenant Cliente Completo',
      `cliente-completo-${suffix}@test.com`,
    );

    const created = await request(app.getHttpServer())
      .post('/customers')
      .set(auth)
      .send({
        name: 'Juana',
        lastName: 'Pérez',
        whatsapp: '5491122223333',
        address: 'Av. Siempre Viva 742',
        city: 'Springfield',
        province: 'Buenos Aires',
        postalCode: '1900',
        country: 'Argentina',
        notes: 'Cliente frecuente',
      })
      .expect(201);
    const body = created.body as CustomerBody;
    expect(body.lastName).toBe('Pérez');
    expect(body.whatsapp).toBe('5491122223333');
    expect(body.city).toBe('Springfield');
    expect(body.isActive).toBe(true);

    const updated = await request(app.getHttpServer())
      .patch(`/customers/${body.id}`)
      .set(auth)
      .send({ city: 'La Plata' })
      .expect(200);
    expect((updated.body as CustomerBody).city).toBe('La Plata');
  });

  it('busca clientes por apellido y por WhatsApp', async () => {
    const { auth } = await registerTenant(
      'Tenant Busqueda Cliente',
      `cliente-busqueda-${suffix}@test.com`,
    );

    await request(app.getHttpServer())
      .post('/customers')
      .set(auth)
      .send({ name: 'Carlos', lastName: 'Gómez', whatsapp: '5491199998888' })
      .expect(201);

    const byLastName = await request(app.getHttpServer())
      .get('/customers?q=Gómez')
      .set(auth)
      .expect(200);
    expect(
      (byLastName.body as CustomerBody[]).some((c) => c.lastName === 'Gómez'),
    ).toBe(true);

    const byWhatsapp = await request(app.getHttpServer())
      .get('/customers?q=5491199998888')
      .set(auth)
      .expect(200);
    expect(
      (byWhatsapp.body as CustomerBody[]).some(
        (c) => c.whatsapp === '5491199998888',
      ),
    ).toBe(true);
  });

  it('un cliente dado de baja (isActive: false) no aparece en el listado por defecto', async () => {
    const { auth } = await registerTenant(
      'Tenant Baja Cliente',
      `cliente-baja-${suffix}@test.com`,
    );

    const created = await request(app.getHttpServer())
      .post('/customers')
      .set(auth)
      .send({ name: 'Cliente Inactivo' })
      .expect(201);
    const id = (created.body as CustomerBody).id;

    await request(app.getHttpServer())
      .patch(`/customers/${id}`)
      .set(auth)
      .send({ isActive: false })
      .expect(200);

    const defaultList = await request(app.getHttpServer())
      .get('/customers?q=Cliente Inactivo')
      .set(auth)
      .expect(200);
    expect((defaultList.body as CustomerBody[]).some((c) => c.id === id)).toBe(
      false,
    );

    const includeInactive = await request(app.getHttpServer())
      .get('/customers?q=Cliente Inactivo&includeInactive=true')
      .set(auth)
      .expect(200);
    expect(
      (includeInactive.body as CustomerBody[]).some((c) => c.id === id),
    ).toBe(true);
  });
});
