# Seguridad y despliegue (Sprint 9)

## 1. Refresh tokens: rotación + detección de reuso

`RefreshToken` (`schema.prisma`) guarda un hash SHA-256 de cada refresh
token emitido (nunca el JWT en texto plano) junto a `isRevoked`/`expiresAt`.
Sin RLS a propósito — mismo motivo que el bypass de login sobre `User` (ver
`withAuthLookupContext`): rotar/revocar pasa por buscar por `tokenHash`
antes de conocer el tenant, y `SUPERADMIN` (sin tenant) también rota
tokens.

- **Login/registro** (`AuthService.generateTokens`): emite access (15 min)
  + refresh (7 días, con `jti` aleatorio — dos tokens del mismo usuario
  emitidos en el mismo segundo de reloj serían el JWT idéntico byte a byte
  sin esto, por la firma HMAC determinística) y persiste la fila.
- **`POST /auth/refresh`**: valida firma/vencimiento del JWT, busca la fila
  por hash. Si ya estaba `isRevoked=true`, es una señal de robo (alguien
  usó un token que el dueño legítimo ya rotó) — se revocan TODOS los
  refresh tokens activos de ese usuario y se corta el flujo con 401. Si
  está vigente, se marca revocada y se emite un par nuevo (rotación).
- **`POST /auth/logout`**: revoca la fila de ESE token puntual — no hace
  falta validar el JWT (poseer el string alcanza, misma lógica que cerrar
  sesión por cookie), y es idempotente.

Ver `apps/api/test/auth-security.e2e-spec.ts`.

## 2. Rate limiting (`@nestjs/throttler`)

Un único throttler `default` (300 req/min por IP) aplicado global vía
`APP_GUARD`. `/auth/login` y `/auth/register-tenant` lo pisan a 5/min
(`@Throttle`); el webhook de WooCommerce a 60/min (reintentos agresivos de
WooCommerce ante una falla propia no deberían tratarse como tráfico
normal). `AppThrottlerGuard` (extiende `ThrottlerGuard`) es la única forma
de desactivarlo, y solo cuando `THROTTLE_DISABLE_FOR_TESTS=true` — fijado
por defecto en `test/jest-e2e.setup.ts` para toda la suite e2e (que crea
tenants/usuarios a un ritmo que rompería el límite real sin ser abuso), y
reactivado explícitamente en `auth-security.e2e-spec.ts`, el único archivo
que necesita probar el 429 de verdad.

## 3. Headers, compresión y CORS

`main.ts`: `helmet()`, `compression()`, y CORS con `credentials: true` +
`origin` desde `CORS_ORIGIN` (lista separada por comas — ver
`common/cors-origins.util.ts`). Sin la variable, cae a
`http://localhost:3000`, nunca a `"*"` (inválido junto con
`credentials: true`, y de cualquier forma no es un default razonable para
producción).

## 4. Auditoría RLS

`test/rls-audit.e2e-spec.ts` consulta `pg_class`/`pg_policies` directo
(no lo que dicen los archivos de migración por separado) para confirmar
`FORCE ROW LEVEL SECURITY` + al menos una policy en toda tabla de negocio
tenant-scoped. Encontró y cerró un hueco real: `Tenant` no tenía su propia
policy (`id` como límite, ya que no tiene una columna `tenantId` separada)
— cualquier query sin filtro explícito podía listar nombre/slug de todos
los tenants. Ver la migración `..._security_hardening` y el comentario en
`AuthService.registerTenant` (crear un tenant necesita pre-generar su id
para poder setear `app.tenant_id` ANTES del insert, algo que Store/User no
necesitan porque el tenant ya existe cuando se crean esas filas).

Excepciones documentadas (no son huecos, son decisiones): `BundleItem` /
`OrderItemBundleComponent` (sin `tenantId` propio, heredan aislamiento vía
FK a `Product`/`OrderItem`, que sí están protegidos), `WooCommerceConfig` y
`RefreshToken` (necesitan resolverse por id/hash sin conocer el tenant de
antemano — el webhook público y el flujo de refresh, respectivamente).

## 5. Resiliencia offline (apps/pos-web)

- `useNetworkStatus()` (evento `online`/`offline` del browser) alimenta el
  badge del header del POS y bloquea el botón "Confirmar cobro" en
  `CheckoutModal` — con un chequeo repetido dentro de `handleConfirm` como
  defensa en profundidad ante perder la conexión entre el click y el
  request. Nunca se manda un cobro a medias.
- `usePosCatalog` persiste el último catálogo+stock que cargó bien en
  `localStorage` (`lib/catalog-cache.ts`) y cae a esa copia si la carga en
  vivo falla — la grilla sigue armable con datos de hace unos minutos en
  vez de quedar vacía ante un microcorte. El header muestra un badge
  "Catálogo guardado (sin actualizar)" cuando está usando la copia
  guardada.

## 6. Salud del sistema

`GET /health` (`@nestjs/terminus`) — Postgres (`SELECT 1` + latencia),
Redis (`PING` + latencia, conexión efímera con `lazyConnect`), heap/RSS del
proceso (`MemoryHealthIndicator`) y uptime. Sin `@UseGuards` a propósito:
lo consultan orquestadores/health checks de Docker, no usuarios logueados.

## 7. Docker

- `apps/api/Dockerfile` / `apps/pos-web/Dockerfile`: build multi-stage,
  contexto = raíz del repo (necesitan ver `packages/database` y
  `packages/shared-types`, unidos por `workspace:*`):
  ```
  docker build -f apps/api/Dockerfile -t pos-api .
  docker build -f apps/pos-web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=... -t pos-web .
  ```
  `NEXT_PUBLIC_API_URL` se hornea en el bundle de cliente en BUILD TIME
  (`--build-arg`), no sirve seteada solo en runtime. El runtime de `api`
  corre como usuario `node` (no root) y `prisma generate` se ejecuta DENTRO
  del contenedor Alpine (nunca se copia un client generado en Windows/otro
  SO — el motor de Prisma es un binario nativo específico de plataforma).
- `apps/api/docker-entrypoint.sh`: corre `prisma migrate deploy`
  automáticamente antes de levantar el server — no hace falta un paso
  manual ni un servicio de migración aparte.
- `docker-compose.dev.yml` (antes `docker-compose.yml`): solo Postgres +
  Redis, para correr `apps/api`/`apps/pos-web` nativos con `pnpm dev` (hot
  reload). `docker-compose.prod.yml`: stack completo containerizado
  (postgres, redis, api, pos-web) — sin un servicio de worker aparte, los
  jobs de BullMQ (AFIP, WooCommerce) corren embebidos en el proceso de
  `api`, no en un proceso separado.
- Variables documentadas en `.env.example` (con secciones para DB, auth,
  AFIP, WooCommerce y CORS).

**Pendiente de verificar en este entorno:** el daemon de Docker Desktop no
estaba corriendo durante esta sesión, así que `docker build`/
`docker compose up` no se corrieron de punta a punta — los Dockerfiles
siguen el patrón estándar documentado de pnpm + Next.js standalone, pero
falta la verificación real de "levantar contenedores en un entorno limpio".
