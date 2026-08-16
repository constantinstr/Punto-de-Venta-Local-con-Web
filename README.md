# POS SaaS — Punto de Venta Local con Web

Plataforma SaaS de Punto de Venta Web/PWA multi-tenant con sincronización de
stock en tiempo real (WooCommerce) y facturación electrónica AFIP.

Ver `docs/ARCHITECTURE.md` para el diseño completo y `docs/ROADMAP.md` para
el plan de sprints.

## Estructura

```
apps/
  pos-web/    Next.js PWA — POS de mostrador
  api/         NestJS — API principal
packages/
  database/    Prisma schema + client
  shared-types/ Tipos compartidos entre api y pos-web
```

## Requisitos

- Node.js ≥ 20
- pnpm (`npm install -g pnpm` si no lo tenés)
- Postgres + Redis, por alguna de estas dos vías:
  - **Docker** (`docker compose up -d`, ver `docker-compose.yml`) — requiere Docker
    Desktop con backend WSL2 funcionando.
  - **Servicios nativos de Windows** (lo usado en este entorno, porque WSL2 no
    estaba disponible): PostgreSQL 17 (`winget install PostgreSQL.PostgreSQL.17`)
    y Memurai Developer (`winget install Memurai.MemuraiDeveloper`), compatible
    con Redis 7. Ambos corren como servicios de Windows (`Get-Service postgresql-x64-17`,
    `Get-Service Memurai`).

Si vas por la vía nativa, la base y el rol ya deben existir antes de migrar:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE ROLE pos WITH LOGIN PASSWORD 'pos';" -c "CREATE DATABASE pos_saas OWNER pos;"
```

## Puesta en marcha (primera vez)

> Cada herramienta lee `.env` desde su propio directorio de trabajo (Prisma CLI,
> `@nestjs/config`, Next.js), así que además del `.env` de la raíz hace falta uno
> por paquete: `packages/database/prisma/.env` (solo `DATABASE_URL`),
> `apps/api/.env` (`DATABASE_URL`, `REDIS_URL`, secrets, `PORT`) y
> `apps/pos-web/.env.local` (`NEXT_PUBLIC_API_URL`). Los tres están gitignorados.

```bash
cp .env.example .env          # ajustar si hace falta
# docker compose up -d        # alternativa si usás Docker en vez de servicios nativos
pnpm install

# construir los paquetes compartidos antes de levantar las apps
pnpm --filter @pos/database run build
pnpm --filter @pos/shared-types run build

# primera migración (crea las tablas a partir de prisma/schema.prisma)
pnpm db:migrate

pnpm dev                      # levanta api (puerto 3001) y pos-web (puerto 3000)
```

Verificación rápida de que todo está arriba:

```bash
curl http://localhost:3001/health
# { "status": "ok", "db": true, "redis": true }

curl -X POST http://localhost:3001/queue-demo -H "Content-Type: application/json" -d '{"hola":"mundo"}'
# { "jobId": "1" } — revisar logs de apps/api, el worker debe loguear el job procesado
```

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Corre todas las apps en modo desarrollo (Turborepo) |
| `pnpm build` | Build de producción de todo el monorepo |
| `pnpm lint` / `pnpm typecheck` | Lint y chequeo de tipos en todos los paquetes |
| `pnpm db:migrate` | Corre `prisma migrate dev` sobre `packages/database` |
| `pnpm --filter @pos/database run studio` | Abre Prisma Studio para inspeccionar la DB |
