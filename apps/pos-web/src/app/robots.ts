import type { MetadataRoute } from "next";

// Convención de archivo de Next — genera /robots.txt solo. Bloquea todo lo que vive
// detrás de login (POS de mostrador + panel admin): no tiene valor de indexación y
// evita que Google intente rastrear pantallas privadas (que igual redirigirían a
// /login). Ver también el `robots: noindex` explícito en esas rutas — este archivo es
// la primera línea de defensa, ese es la segunda ("doble cinturón").
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/terminos", "/privacidad"],
      disallow: ["/pos", "/login", "/register", "/olvide-password", "/reset-password", "/inicio", "/catalog", "/customers", "/purchases", "/quotes", "/reports", "/sales", "/settings", "/stock", "/platform", "/ayuda"],
    },
    sitemap: "https://vendenube.com.ar/sitemap.xml",
  };
}
