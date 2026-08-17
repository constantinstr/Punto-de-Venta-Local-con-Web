import type { SubscriptionStatus, EnforcementPolicy } from '@pos/database';

// Estado *efectivo* de la suscripción, derivado de las fechas al momento de
// leer. A propósito NO existe un job que recorra tenants marcando vencidos:
// un cron que falla en silencio deja clientes cobrados de más o de menos y
// nadie se entera hasta el reclamo. Una función pura no puede fallar, no
// necesita Redis ni scheduler, y se testea sin base de datos.
export type EffectiveState =
  | 'TRIAL' // período de prueba vigente
  | 'ACTIVE' // suscripción paga y vigente
  | 'GRACE' // venció, pero dentro de los días de gracia
  | 'EXPIRED' // venció y se pasó la gracia
  | 'CANCELLED'; // dada de baja en Mercado Pago

export interface SubscriptionSnapshot {
  state: EffectiveState;
  /** Días que faltan para el próximo corte. Negativo = días de atraso. */
  daysRemaining: number;
  /** true si conviene mostrarle un aviso al usuario. */
  shouldWarn: boolean;
  /** Mensaje listo para mostrar en el banner, o null si no hay nada que avisar. */
  message: string | null;
  /** Si esta política, en este estado, debería impedir operaciones de escritura. */
  blocksWrites: boolean;
  /** Si esta política, en este estado, debería impedir el acceso entero. */
  blocksAccess: boolean;
}

export interface SubscriptionInput {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  enforcementPolicy: EnforcementPolicy;
}

export interface SubscriptionConfig {
  graceDays: number;
  /** Cuántos días antes del vencimiento se empieza a avisar. */
  warnBeforeDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Sentinela para tenants sin vencimiento definido (ver el final de
// resolveState). Un número grande y finito, no Infinity, para que sobreviva
// a JSON.stringify.
const NO_EXPIRY_DAYS = 36_500; // ~100 años

// Diferencia en días calendario, redondeada hacia arriba: si vence dentro de
// 30 minutos "queda 1 día", no 0. Evita que el banner diga "vence hoy" y el
// sistema ya lo trate como vencido.
function daysUntil(target: Date, now: Date): number {
  return Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY);
}

export function resolveSubscription(
  input: SubscriptionInput,
  config: SubscriptionConfig,
  now: Date = new Date(),
): SubscriptionSnapshot {
  const { state, daysRemaining } = resolveState(input, config, now);

  const shouldWarn =
    state === 'GRACE' ||
    state === 'EXPIRED' ||
    state === 'CANCELLED' ||
    daysRemaining <= config.warnBeforeDays;

  // WARN_ONLY es el default y la política comercial elegida: nunca traba a un
  // comercio en el mostrador. READ_ONLY y BLOCK existen para poder endurecer
  // un caso puntual desde el panel sin tocar código.
  const overdue = state === 'EXPIRED' || state === 'CANCELLED';
  const blocksWrites =
    overdue &&
    (input.enforcementPolicy === 'READ_ONLY' ||
      input.enforcementPolicy === 'BLOCK');
  const blocksAccess = overdue && input.enforcementPolicy === 'BLOCK';

  return {
    state,
    daysRemaining,
    shouldWarn,
    message: buildMessage(state, daysRemaining, shouldWarn),
    blocksWrites,
    blocksAccess,
  };
}

function resolveState(
  input: SubscriptionInput,
  config: SubscriptionConfig,
  now: Date,
): { state: EffectiveState; daysRemaining: number } {
  // Una baja en Mercado Pago manda sobre las fechas, pero solo una vez que
  // efectivamente se consumió el período ya pagado: si cancela el día 3 de un
  // mes que pagó completo, le corresponde usarlo hasta el final.
  if (input.subscriptionStatus === 'CANCELLED') {
    const paidUntil = input.currentPeriodEnd;
    if (paidUntil && paidUntil.getTime() > now.getTime()) {
      return { state: 'ACTIVE', daysRemaining: daysUntil(paidUntil, now) };
    }
    return {
      state: 'CANCELLED',
      daysRemaining: paidUntil ? daysUntil(paidUntil, now) : 0,
    };
  }

  // Suscripción paga: currentPeriodEnd manda sobre el trial (un tenant que
  // pagó durante la prueba no vuelve a "TRIAL" cuando esta termina).
  if (input.currentPeriodEnd) {
    const remaining = daysUntil(input.currentPeriodEnd, now);
    if (remaining > 0) return { state: 'ACTIVE', daysRemaining: remaining };
    if (remaining > -config.graceDays)
      return { state: 'GRACE', daysRemaining: remaining };
    return { state: 'EXPIRED', daysRemaining: remaining };
  }

  // Todavía no pagó nunca: rige el período de prueba.
  if (input.trialEndsAt) {
    const remaining = daysUntil(input.trialEndsAt, now);
    if (remaining > 0) return { state: 'TRIAL', daysRemaining: remaining };
    if (remaining > -config.graceDays)
      return { state: 'GRACE', daysRemaining: remaining };
    return { state: 'EXPIRED', daysRemaining: remaining };
  }

  // Sin trial ni pago registrado (tenants creados antes de esta migración):
  // se los trata como activos para no romperles el sistema de un día para el
  // otro. Se regularizan asignándoles fecha desde el panel.
  //
  // NO se usa Infinity: JSON.stringify lo convierte en null, y el tipo
  // declarado (number) dejaría de ser cierto del otro lado del cable.
  return { state: 'ACTIVE', daysRemaining: NO_EXPIRY_DAYS };
}

function buildMessage(
  state: EffectiveState,
  daysRemaining: number,
  shouldWarn: boolean,
): string | null {
  if (!shouldWarn) return null;

  const overdueDays = Math.abs(daysRemaining);

  switch (state) {
    case 'TRIAL':
      return daysRemaining === 1
        ? 'Tu prueba gratuita termina mañana. Suscribite para no perder el servicio.'
        : `Tu prueba gratuita termina en ${daysRemaining} días. Suscribite para no perder el servicio.`;
    case 'ACTIVE':
      return daysRemaining === 1
        ? 'Tu suscripción se renueva mañana.'
        : `Tu suscripción se renueva en ${daysRemaining} días.`;
    case 'GRACE':
      return overdueDays === 0
        ? 'Tu suscripción vence hoy. Regularizá el pago para seguir usando el sistema.'
        : `Tu suscripción venció hace ${overdueDays} día(s). Regularizá el pago para seguir usando el sistema.`;
    case 'EXPIRED':
      return `Tu suscripción está vencida hace ${overdueDays} día(s). Regularizá el pago a la brevedad.`;
    case 'CANCELLED':
      return 'Tu suscripción está dada de baja. Reactivala para seguir usando el sistema.';
  }
}
