import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para el build de Docker (apps/pos-web/Dockerfile): empaqueta
  // solo el server + las dependencias de node_modules que realmente usa en
  // runtime en .next/standalone, en vez de copiar el node_modules completo
  // del monorepo a la imagen final.
  output: "standalone",
  // Sin esto, Next usa apps/pos-web como raíz de tracing y descarta paquetes
  // que viven fuera de esa carpeta (p. ej. node_modules/.pnpm/@swc+helpers
  // en la raíz del monorepo), lo que rompe el standalone en runtime con
  // "Cannot find module '.../@swc/helpers/esm/_interop_require_default.js'".
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  // El tracer (@vercel/nft) solo detecta la variante cjs de @swc/helpers
  // (la que el bundle realmente importa) pero require-hook.js de Next
  // también necesita esm/* en runtime para decidir el modo de interop —
  // al no ser un require estático, nft no lo traza solo. Se incluye a mano
  // para todas las rutas.
  outputFileTracingIncludes: {
    "/*": ["../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*"],
  },
};

export default nextConfig;
