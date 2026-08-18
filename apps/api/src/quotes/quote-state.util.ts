import type { QuoteStatus } from '@pos/database';

// "Vencido" no se persiste — se deriva combinando status y validUntil al
// leer, mismo criterio que subscription-status.util.ts: no hay ningún cron
// en el proyecto que "marque vencidos", justamente para que no pueda fallar
// en silencio.
export type EffectiveQuoteState =
  'OPEN' | 'EXPIRED' | 'CONVERTED' | 'CANCELLED';

export function resolveQuoteState(
  quote: { status: QuoteStatus; validUntil: Date },
  now: Date = new Date(),
): EffectiveQuoteState {
  if (quote.status !== 'OPEN') return quote.status;
  return quote.validUntil.getTime() < now.getTime() ? 'EXPIRED' : 'OPEN';
}
