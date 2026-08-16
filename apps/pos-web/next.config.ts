import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para el build de Docker (apps/pos-web/Dockerfile): empaqueta
  // solo el server + las dependencias de node_modules que realmente usa en
  // runtime en .next/standalone, en vez de copiar el node_modules completo
  // del monorepo a la imagen final.
  output: "standalone",
};

export default nextConfig;
