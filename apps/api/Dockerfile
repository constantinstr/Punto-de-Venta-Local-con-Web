# syntax=docker/dockerfile:1
#
# Build de punta a punta para @pos/api dentro del monorepo pnpm. Se corre
# con el ROOT del repo como build context (necesita ver packages/database y
# packages/shared-types, unidos por workspace:*):
#
#   docker build -f apps/api/Dockerfile -t pos-api .
#
# (docker-compose.prod.yml ya lo invoca así — ver ese archivo.)

FROM node:22-alpine AS base
# Prisma necesita openssl para el motor de consultas en Alpine (musl) — sin
# esto, el binario nativo generado por `prisma generate` falla al arrancar
# con "unable to open libssl" recién en runtime, no en build time.
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /repo

# ── deps: instala TODO el workspace (dev incluido) para poder compilar ──
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

# ── build: prisma generate + compila los 3 paquetes en orden de dependencia ──
FROM deps AS build
COPY packages/database packages/database
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api
RUN pnpm --filter @pos/database run build \
 && pnpm --filter @pos/shared-types run build \
 && pnpm --filter @pos/api run build

# ── prod-deps: mismo árbol, pero podado a solo dependencies (sin dev) ──
FROM build AS prod-deps
RUN pnpm install --prod --frozen-lockfile

# ── runtime: imagen final — sin toolchain de build, usuario sin privilegios ──
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/packages/database/node_modules ./packages/database/node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules

COPY --from=build /repo/packages/database/dist ./packages/database/dist
COPY --from=build /repo/packages/database/generated ./packages/database/generated
COPY --from=build /repo/packages/database/prisma ./packages/database/prisma
COPY --from=build /repo/packages/database/package.json ./packages/database/package.json
COPY --from=build /repo/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /repo/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
RUN chmod +x ./apps/api/docker-entrypoint.sh

# La imagen base node:* ya trae un usuario "node" (uid 1000) sin privilegios
# — no hace falta crearlo a mano.
RUN chown -R node:node /repo
USER node

EXPOSE 3001
ENTRYPOINT ["./apps/api/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
