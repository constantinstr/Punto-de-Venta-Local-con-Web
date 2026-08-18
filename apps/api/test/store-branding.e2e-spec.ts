import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { STORE_LOGOS_DIR } from '../src/stores/store-logo.storage';

interface AuthResponseBody {
  tokens: { accessToken: string };
}
interface StoreBody {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
}

// Un logo PNG 1x1 mínimo válido, para no depender de un archivo en disco.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

// Cubre los datos de marca del local (teléfono y logo) que salen impresos en
// el ticket/factura — ver ThermalReceipt.tsx.
describe('Datos de marca del local — e2e', () => {
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
    const auth = {
      Authorization: `Bearer ${(res.body as AuthResponseBody).tokens.accessToken}`,
    };

    const storesRes = await request(app.getHttpServer())
      .get('/stores')
      .set(auth)
      .expect(200);
    const storeId = (storesRes.body as StoreBody[])[0].id;

    return { auth, storeId };
  }

  async function createCashier(
    auth: Record<string, string>,
    email: string,
  ): Promise<Record<string, string>> {
    await request(app.getHttpServer())
      .post('/users')
      .set(auth)
      .send({
        email,
        password: 'password123',
        fullName: 'Cajero Test',
        role: 'CASHIER',
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return {
      Authorization: `Bearer ${(login.body as AuthResponseBody).tokens.accessToken}`,
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
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

  it('el dueño puede cargar teléfono y logo del local', async () => {
    const { auth, storeId } = await registerTenant(
      'Marca',
      `marca-${suffix}@test.com`,
    );

    const updated = await request(app.getHttpServer())
      .patch(`/stores/${storeId}`)
      .set(auth)
      .send({ phone: '11-5555-5555' })
      .expect(200);
    expect((updated.body as StoreBody).phone).toBe('11-5555-5555');

    const withLogo = await request(app.getHttpServer())
      .post(`/stores/${storeId}/logo`)
      .set(auth)
      .attach('file', TINY_PNG, {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(201);
    // Todo se normaliza a WebP al comprimir, sin importar el formato de
    // entrada — ver image-processing.ts.
    expect((withLogo.body as StoreBody).logoUrl).toMatch(
      /^\/uploads\/stores\/.+\.webp$/,
    );
    const logoUrl = (withLogo.body as StoreBody).logoUrl!;

    const listado = await request(app.getHttpServer())
      .get('/stores')
      .set(auth)
      .expect(200);
    expect((listado.body as StoreBody[])[0].logoUrl).toBe(logoUrl);
  });

  it('rechaza un archivo que no sea imagen', async () => {
    const { auth, storeId } = await registerTenant(
      'Marca Invalida',
      `marca-inv-${suffix}@test.com`,
    );

    await request(app.getHttpServer())
      .post(`/stores/${storeId}/logo`)
      .set(auth)
      .attach('file', Buffer.from('no soy una imagen'), {
        filename: 'archivo.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });

  it('un cajero no puede cambiar el logo del local', async () => {
    const { auth, storeId } = await registerTenant(
      'Marca Cajero',
      `marca-caj-${suffix}@test.com`,
    );
    const cashierAuth = await createCashier(
      auth,
      `cajero-marca-${suffix}@test.com`,
    );

    await request(app.getHttpServer())
      .post(`/stores/${storeId}/logo`)
      .set(cashierAuth)
      .attach('file', TINY_PNG, {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(403);
  });

  it('comprime el logo a WebP y el archivo guardado pesa menos que el original', async () => {
    const { auth, storeId } = await registerTenant(
      'Marca Compresion',
      `marca-compresion-${suffix}@test.com`,
    );

    // PNG grande y "real" (ruido, no comprime bien como PNG) para que la
    // diferencia de peso contra el WebP resultante sea significativa.
    const bigPng = await sharp({
      create: {
        width: 1200,
        height: 1200,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .png()
      .toBuffer();

    const res = await request(app.getHttpServer())
      .post(`/stores/${storeId}/logo`)
      .set(auth)
      .attach('file', bigPng, {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(201);

    const logoUrl = (res.body as StoreBody).logoUrl!;
    expect(extname(logoUrl)).toBe('.webp');

    const savedPath = join(STORE_LOGOS_DIR, logoUrl.split('/').pop()!);
    const saved = await readFile(savedPath);
    expect(saved.length).toBeLessThan(bigPng.length);

    const meta = await sharp(saved).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(600);
    expect(meta.height).toBeLessThanOrEqual(600);
  });

  it('rechaza un archivo con mimetype de imagen falseado pero contenido no-imagen', async () => {
    const { auth, storeId } = await registerTenant(
      'Marca Mimetype Falso',
      `marca-mime-falso-${suffix}@test.com`,
    );

    await request(app.getHttpServer())
      .post(`/stores/${storeId}/logo`)
      .set(auth)
      .attach('file', Buffer.from('esto no es una imagen de verdad'), {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(400);
  });
});
