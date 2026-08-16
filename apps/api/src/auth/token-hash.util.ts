import { createHash } from 'crypto';

// El refresh token en sí ya es un JWT firmado (impredecible sin el
// secreto) — este hash es solo el índice de búsqueda en RefreshToken, no
// una defensa de "secreto de un solo sentido" al estilo password. Por eso
// SHA-256 (rápido, determinístico -> permite WHERE tokenHash = X) y no
// bcrypt (pensado para comparar 1 a 1 contra pocas filas, no para indexar).
export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
