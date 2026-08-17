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

# CA extra de confianza para el BUILD. Solo hace falta en máquinas de
# desarrollo con un antivirus que intercepta HTTPS (AVG/Avast/Kaspersky "Web
# Shield" y similares): re-firman el tráfico con una CA propia que la imagen
# no conoce, y entonces `pnpm install` no puede validar el registry de npm y
# falla con UNABLE_TO_VERIFY_LEAF_SIGNATURE.
#
# Se pasa el PEM en base64 por build-arg y no como archivo, porque certs/
# está en .gitignore y un COPY de una carpeta inexistente rompería el build
# en el servidor. Vacío en producción => no hace nada.
ARG EXTRA_CA_CERT_B64=""
# El archivo se crea siempre (vacío si no vino el arg) para que
# NODE_EXTRA_CA_CERTS nunca apunte a una ruta inexistente, que haría a Node
# emitir un warning en cada comando del build.
RUN mkdir -p /usr/local/share/ca-certificates && \
    if [ -n "$EXTRA_CA_CERT_B64" ]; then \
      echo "$EXTRA_CA_CERT_B64" | base64 -d > /usr/local/share/ca-certificates/extra-ca.crt && \
      echo "CA extra instalada para el build"; \
    else \
      : > /usr/local/share/ca-certificates/extra-ca.crt; \
    fi
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/extra-ca.crt

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
RUN pnpm install --prod --frozen-lockfile --config.confirmModulesPurge=false

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

# Imágenes de producto subidas (ver products/product-image.storage.ts) —
# creada acá para que quede con dueño node:node antes del chown de abajo;
# docker-compose.prod.yml monta un volumen nombrado sobre este path para que
# sobrevivan a un redeploy del contenedor.
RUN mkdir -p uploads/products

# La imagen base node:* ya trae un usuario "node" (uid 1000) sin privilegios
# — no hace falta crearlo a mano.
RUN chown -R node:node /repo
USER node

EXPOSE 3001
ENTRYPOINT ["./apps/api/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
