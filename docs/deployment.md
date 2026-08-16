# Guía de despliegue y operación

Manual operativo end-to-end: arranque (dev y producción), alta de un tenant
nuevo de punta a punta (sucursal, AFIP, WooCommerce) y mantenimiento/backups.
Para el diseño técnico en profundidad ver [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md),
[`docs/afip.md`](./afip.md), [`docs/woocommerce-sync.md`](./woocommerce-sync.md)
y [`docs/security-and-deployment.md`](./security-and-deployment.md).

---

## 1. Arquitectura y stack (resumen)

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend | Next.js (App Router) + TS, PWA | POS de mostrador (`apps/pos-web`) — funciona con la conexión caída (catálogo cacheado, bloqueo de cobros a medias) |
| Backend | NestJS + TS | API principal (`apps/api`): auth, catálogo, ventas, caja, reportes, AFIP, WooCommerce |
| Base de datos | PostgreSQL + Prisma | Multi-tenant con `tenantId` por fila + **Row Level Security** forzada como segunda barrera |
| Colas | Redis + BullMQ | Jobs de AFIP (CAE) y WooCommerce (sync stock/pedidos) corren embebidos en el proceso de `api`, sin worker separado |
| Facturación | Módulo AFIP (`apps/api/src/afip`, `fiscal-config`, `invoices`) | WSAA (autenticación) + WSFE v1 (CAE) para Factura A/B/C |
| E-commerce | Módulo WooCommerce (`apps/api/src/woocommerce`) | Sync bidireccional de stock vía REST API + webhooks firmados HMAC |

Monorepo pnpm + Turborepo: `apps/pos-web`, `apps/api`, `packages/database`
(schema Prisma), `packages/shared-types`.

---

## 2. Guía de arranque rápido

### 2.1 Desarrollo local (`pnpm dev`)

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d   # solo Postgres + Redis
pnpm install
pnpm --filter @pos/database run build
pnpm --filter @pos/shared-types run build
pnpm db:migrate                                   # prisma migrate dev
pnpm dev                                           # api:3001 + pos-web:3000, hot reload
```

Ver [`README.md`](../README.md#puesta-en-marcha-primera-vez) para la vía sin
Docker (servicios nativos de Windows).

### 2.2 Producción — stack completo en Docker

`docker-compose.prod.yml` levanta los 4 servicios containerizados
(`postgres`, `redis`, `api`, `pos-web`) con builds multi-stage. Requiere
Docker Desktop con backend WSL2 funcionando.

```bash
cp .env.example .env
# completar en .env: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (openssl rand -base64 48),
# POSTGRES_USER/PASSWORD/DB, API_PUBLIC_URL, CORS_ORIGIN, NEXT_PUBLIC_API_URL

docker compose -f docker-compose.prod.yml up -d --build
```

`api` corre `prisma migrate deploy` automáticamente en su entrypoint antes
de levantar el server (`apps/api/docker-entrypoint.sh`) — no hace falta un
paso manual la primera vez ni en cada deploy nuevo.

Verificación rápida:

```bash
curl http://localhost:3001/health
curl -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

#### Detener servicios

```bash
docker compose -f docker-compose.prod.yml down       # conserva los volúmenes (datos)
docker compose -f docker-compose.prod.yml down -v     # ¡borra postgres_data y redis_data!
```

#### Logs en vivo

```bash
docker compose -f docker-compose.prod.yml logs -f              # los 4 servicios
docker compose -f docker-compose.prod.yml logs -f api           # solo uno
```

#### Migraciones pendientes de Prisma (manual, sin reiniciar el contenedor)

Normalmente basta con `docker compose -f docker-compose.prod.yml restart api`
(dispara el entrypoint de nuevo), pero para correrlas en caliente sin
reiniciar el proceso:

```bash
docker compose -f docker-compose.prod.yml exec api \
  packages/database/node_modules/.bin/prisma migrate deploy \
  --schema=packages/database/prisma/schema.prisma
```

---

## 3. Checklist de onboarding — alta de un tenant nuevo

Asume la API corriendo en `API_PUBLIC_URL` (`http://localhost:3001` en el
ejemplo). Reemplazar `TOKEN` por el `accessToken` devuelto en cada paso.

### 3.1 Alta del tenant + sucursal inicial + usuario OWNER

`POST /auth/register-tenant` crea el `Tenant`, su primera `Store` y el
usuario `OWNER` en una sola transacción:

```bash
curl -X POST http://localhost:3001/auth/register-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Mi Comercio SRL",
    "storeName": "Casa Central",
    "ownerFullName": "Juana Pérez",
    "ownerEmail": "juana@micomercio.com",
    "ownerPassword": "un-password-de-al-menos-8-caracteres"
  }'
# → { "user": {...}, "tokens": { "accessToken": "...", "refreshToken": "..." } }
```

Guardar el `accessToken` — se usa como `Authorization: Bearer <token>` en
todos los pasos siguientes (rol `OWNER` o `ADMIN`).

### 3.2 Sucursales adicionales

```bash
curl -X POST http://localhost:3001/stores \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Sucursal Norte", "address": "Av. Siempre Viva 742" }'

curl http://localhost:3001/stores -H "Authorization: Bearer TOKEN"
# guardar el `id` de cada Store — hace falta como storeId en los pasos 3.3/3.4
```

### 3.3 Certificados AFIP y Punto de Venta fiscal

Requisitos previos en el portal de AFIP (fuera del sistema): CUIT habilitado
para Facturación Electrónica, certificado `.crt`/`.key` generado y asociado
al Web Service `wsfe` (Administrador de Certificados Digitales), y un Punto
de Venta habilitado como "Web Services" con su número (`ptoVta`).

El contenido de `.crt`/`.key` trae saltos de línea reales, que no se pueden
pegar tal cual dentro de un string JSON — `jq` los escapa correctamente
(`apt install jq` / `brew install jq` / `choco install jq` si no está):

```bash
curl -X POST http://localhost:3001/fiscal-config \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg storeId "STORE_ID" \
    --arg cuit "20304050607" \
    --arg crt "$(cat /ruta/al/certificado.crt)" \
    --arg key "$(cat /ruta/a/la/clave.key)" \
    '{storeId: $storeId, cuit: $cuit, taxCondition: "RESPONSABLE_INSCRIPTO", ptoVta: 4, crtCertificate: $crt, keyCertificate: $key, isProduction: true}')"
```

- `ptoVta` es el número de Punto de Venta asignado a esa `Store` — debe
  coincidir con uno habilitado en AFIP para el CUIT y ser único dentro del
  tenant (`@@unique([tenantId, ptoVta])` en el schema).
- `taxCondition` acepta los valores del enum `FiscalTaxCondition` (ver
  `schema.prisma`, p.ej. `RESPONSABLE_INSCRIPTO`, `MONOTRIBUTO`).
- `isProduction: false` (u omitido) apunta al ambiente de homologación de
  AFIP para probar sin emitir comprobantes reales; `true` es el ambiente
  productivo real.
- Con `AFIP_MOCK=true` en el `.env` de `api` no hace falta ningún
  certificado real — se usa `AfipMockGateway` para todo el flujo (útil para
  demos/QA).

Verificar: `curl "http://localhost:3001/fiscal-config?storeId=STORE_ID" -H "Authorization: Bearer TOKEN"`.

### 3.4 Vinculación con WooCommerce

**a) Generar las REST API Keys en WordPress** (fuera del sistema):
WooCommerce → Ajustes → Avanzado → API REST → Agregar clave → permisos
**Lectura/Escritura** → copiar `Consumer key` (`ck_...`) y
`Consumer secret` (`cs_...`).

**b) Registrar la config en el POS:**

```bash
curl -X POST http://localhost:3001/woocommerce-config \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storeId": "STORE_ID",
    "apiUrl": "https://mitienda.com",
    "consumerKey": "ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "consumerSecret": "cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "webhookSecret": "'"$(openssl rand -hex 16)"'",
    "syncStockOutbound": true,
    "syncStockInbound": true,
    "isActive": true
  }'
# → la respuesta incluye tanto el `id` (configId) como `webhookUrl` ya
# armado con API_PUBLIC_URL — no hace falta construirlo a mano.
```

**c) Registrar el webhook en WordPress** (fuera del sistema): WooCommerce →
Ajustes → Avanzado → Webhooks → Agregar webhook:

| Campo | Valor |
|---|---|
| Tema | Pedido creado (repetir para "Pedido actualizado" si se quiere) |
| Estado | Activo |
| URL de entrega | el `webhookUrl` devuelto en el paso (b) |
| Secreto | el mismo valor de `webhookSecret` del paso (b) |
| Versión de la API REST | WP REST API Integration v3 |

También visible en el panel `/settings/integrations/woocommerce` de
`pos-web`, que arma esta misma URL automáticamente.

**d) Probar conexión e importar catálogo inicial:**

```bash
curl -X POST http://localhost:3001/integrations/woocommerce/test-connection \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{ "storeId": "STORE_ID" }'

curl -X POST http://localhost:3001/integrations/woocommerce/sync-catalog \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{ "storeId": "STORE_ID" }'
```

Empareja por SKU/código de barra contra los productos existentes de
WooCommerce; los `simple` sin match se crean nuevos, los `variable` sin
match quedan como "omitidos" (ver [`docs/woocommerce-sync.md`](./woocommerce-sync.md#4-importación--vinculación-inicial-de-catálogo)).

Con `WOO_MOCK=true` en el `.env` de `api` este flujo entero corre contra
`WooMockGateway`, sin tocar una tienda real.

---

## 4. Mantenimiento y backups

Los nombres de usuario/base usados abajo salen de `.env`
(`POSTGRES_USER`/`POSTGRES_DB`, default `pos`/`pos_saas`).

### Backup — un solo paso

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U pos -d pos_saas > backup-$(date +%Y%m%d-%H%M%S).sql
```

### Restore — un solo paso

```bash
cat backup-20260816-120000.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U pos -d pos_saas
```

> La restauración asume una base vacía o con el mismo schema (el dump
> contiene `CREATE TABLE`/`INSERT`, no hace `DROP` previo). Para restaurar
> sobre una base con datos, recrear el volumen antes
> (`docker compose -f docker-compose.prod.yml down -v` — ver 2.2, esto
> **borra todos los datos actuales**) o restaurar en una base temporal
> distinta y migrar a mano.

### Backup automatizado (cron, opcional)

```cron
0 3 * * * cd /ruta/al/repo && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U pos -d pos_saas | gzip > backups/pos_saas-$(date +\%Y\%m\%d).sql.gz
```
