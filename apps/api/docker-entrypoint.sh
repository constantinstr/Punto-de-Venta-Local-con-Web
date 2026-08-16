#!/bin/sh
set -e

echo "[entrypoint] Aplicando migraciones de Prisma (prisma migrate deploy)..."
packages/database/node_modules/.bin/prisma migrate deploy --schema=packages/database/prisma/schema.prisma
echo "[entrypoint] Migraciones aplicadas — iniciando API."

exec "$@"
