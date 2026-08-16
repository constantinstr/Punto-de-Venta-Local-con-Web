// CORS_ORIGIN: lista separada por comas de orígenes permitidos
// (ej. "https://pos.midominio.com,https://admin.midominio.com"). Sin la
// variable seteada, cae a un default de desarrollo (localhost:3000) en vez
// de "*" — un comodín con `credentials: true` (necesario para mandar el
// header Authorization) ni siquiera es válido en la especificación CORS, y
// "todos los orígenes" no es un default razonable para producción.
const DEV_DEFAULT_ORIGIN = 'http://localhost:3000';

export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw || raw.trim().length === 0) return [DEV_DEFAULT_ORIGIN];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}
