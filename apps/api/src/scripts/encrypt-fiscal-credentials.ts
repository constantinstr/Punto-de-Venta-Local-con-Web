/**
 * Backfill: cifra las credenciales fiscales que quedaron en texto plano de
 * antes de la migración de cifrado.
 *
 *   docker compose -f docker-compose.prod.yml exec api \
 *     node apps/api/dist/scripts/encrypt-fiscal-credentials.js
 *
 * Es IDEMPOTENTE: las filas ya cifradas se saltean, así que se puede correr
 * las veces que haga falta. No desencripta nada ni imprime credenciales.
 *
 * Va por SQL crudo y no por Prisma con RLS porque tiene que ver TODOS los
 * tenants: es una tarea de plataforma, no de un comercio.
 */
import { ConfigService } from '@nestjs/config';
import { prisma } from '@pos/database';
import { EncryptionService } from '../common/crypto/encryption.service';

interface FiscalConfigRow {
  id: string;
  storeId: string;
  crtCertificate: string;
  keyCertificate: string;
}

async function main(): Promise<void> {
  const encryption = new EncryptionService(
    new ConfigService({ ENCRYPTION_KEY: process.env.ENCRYPTION_KEY }),
  );

  const rows = await prisma.$queryRaw<FiscalConfigRow[]>`
    SELECT id, "storeId", "crtCertificate", "keyCertificate"
    FROM "FiscalConfig"
  `;

  let cifradas = 0;
  let yaEstaban = 0;

  for (const row of rows) {
    const crtPlano = !encryption.isEncrypted(row.crtCertificate);
    const keyPlano = !encryption.isEncrypted(row.keyCertificate);

    if (!crtPlano && !keyPlano) {
      yaEstaban++;
      continue;
    }

    const crt = crtPlano
      ? encryption.encrypt(row.crtCertificate)
      : row.crtCertificate;
    const key = keyPlano
      ? encryption.encrypt(row.keyCertificate)
      : row.keyCertificate;

    await prisma.$executeRaw`
      UPDATE "FiscalConfig"
      SET "crtCertificate" = ${crt}, "keyCertificate" = ${key}
      WHERE id = ${row.id}
    `;
    cifradas++;
    console.log(`  cifrada la config fiscal del local ${row.storeId}`);
  }

  console.log(
    `\nListo: ${cifradas} cifrada(s), ${yaEstaban} ya estaba(n) cifrada(s), ${rows.length} en total.`,
  );
}

main()
  .catch((err) => {
    console.error('Falló el backfill de cifrado:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
