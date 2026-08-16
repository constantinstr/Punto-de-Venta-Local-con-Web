// Tipos compartidos entre apps/api y apps/pos-web.
// Se van a ir poblando sprint a sprint (auth, catálogo, venta, caja) a medida
// que se implementen los módulos correspondientes — ver docs/ROADMAP.md.

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}
