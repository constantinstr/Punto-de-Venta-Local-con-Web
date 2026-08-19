import type { MetadataRoute } from "next";

// Convención de archivo de Next — genera /sitemap.xml solo. Solo las 3 URLs
// públicas reales del sitio (ver robots.ts: todo lo demás está detrás de login).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://vendenube.com.ar/", lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: "https://vendenube.com.ar/terminos", lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: "https://vendenube.com.ar/privacidad", lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
