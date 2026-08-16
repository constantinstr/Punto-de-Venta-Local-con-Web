# syntax=docker/dockerfile:1
#
# Build de punta a punta para @pos/pos-web (Next.js standalone) dentro del
# monorepo pnpm. Se corre con el ROOT del repo como build context (necesita
# ver packages/shared-types, unido por workspace:*):
#
#   docker build -f apps/pos-web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.midominio.com \
#     -t pos-web .
#
# NEXT_PUBLIC_API_URL se hornea DENTRO del bundle de cliente en tiempo de
# build (Next.js reemplaza esas variables de forma estática) — no sirve
# pasarla recién en `docker run`/docker-compose como si fuera config de
# runtime, tiene que ser un --build-arg.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ── deps ──
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/pos-web/package.json apps/pos-web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

# ── build ──
FROM deps AS build
COPY packages/shared-types packages/shared-types
COPY apps/pos-web apps/pos-web
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @pos/shared-types run build \
 && pnpm --filter @pos/pos-web run build

# ── runtime: solo el output standalone — no queda pnpm ni node_modules
# completo, next trace ya empaquetó lo mínimo que el server necesita ──
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /repo/apps/pos-web/.next/standalone ./
COPY --from=build /repo/apps/pos-web/.next/static ./apps/pos-web/.next/static
COPY --from=build /repo/apps/pos-web/public ./apps/pos-web/public

USER node
EXPOSE 3000
CMD ["node", "apps/pos-web/server.js"]
