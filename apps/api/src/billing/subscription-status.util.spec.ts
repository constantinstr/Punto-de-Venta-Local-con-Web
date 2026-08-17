import {
  resolveSubscription,
  type SubscriptionConfig,
  type SubscriptionInput,
} from './subscription-status.util';

// Esta es la función que decide si un comercio está al día o vencido, y de
// ella depende que no se le corte el servicio a alguien que pagó. Se testea
// sin base de datos justamente porque es pura: acá se cubren los bordes
// (último día, primer día de gracia, límite de gracia) que en producción
// aparecen una vez por mes y por cliente.
describe('resolveSubscription', () => {
  const config: SubscriptionConfig = { graceDays: 10, warnBeforeDays: 7 };
  const now = new Date('2026-08-17T12:00:00Z');

  function input(over: Partial<SubscriptionInput> = {}): SubscriptionInput {
    return {
      subscriptionStatus: 'ACTIVE',
      trialEndsAt: null,
      currentPeriodEnd: null,
      enforcementPolicy: 'WARN_ONLY',
      ...over,
    };
  }

  describe('período de prueba', () => {
    it('está en TRIAL mientras falten días', () => {
      const r = resolveSubscription(
        input({
          subscriptionStatus: 'TRIAL',
          trialEndsAt: new Date('2026-09-01T12:00:00Z'),
        }),
        config,
        now,
      );
      expect(r.state).toBe('TRIAL');
      expect(r.daysRemaining).toBe(15);
      expect(r.shouldWarn).toBe(false);
    });

    it('avisa cuando faltan menos días que warnBeforeDays', () => {
      const r = resolveSubscription(
        input({
          subscriptionStatus: 'TRIAL',
          trialEndsAt: new Date('2026-08-20T12:00:00Z'),
        }),
        config,
        now,
      );
      expect(r.state).toBe('TRIAL');
      expect(r.shouldWarn).toBe(true);
      expect(r.message).toContain('3 días');
    });

    it('pasa a GRACE apenas vence, no a EXPIRED', () => {
      const r = resolveSubscription(
        input({
          subscriptionStatus: 'TRIAL',
          trialEndsAt: new Date('2026-08-16T12:00:00Z'),
        }),
        config,
        now,
      );
      expect(r.state).toBe('GRACE');
    });
  });

  describe('suscripción paga', () => {
    it('está ACTIVE mientras el período no venció', () => {
      const r = resolveSubscription(
        input({ currentPeriodEnd: new Date('2026-09-17T12:00:00Z') }),
        config,
        now,
      );
      expect(r.state).toBe('ACTIVE');
      expect(r.daysRemaining).toBe(31);
    });

    it('un pago vigente manda sobre un trial ya vencido', () => {
      const r = resolveSubscription(
        input({
          trialEndsAt: new Date('2026-07-01T12:00:00Z'), // venció hace rato
          currentPeriodEnd: new Date('2026-09-17T12:00:00Z'),
        }),
        config,
        now,
      );
      expect(r.state).toBe('ACTIVE');
    });

    it('sigue en GRACE dentro de los días de gracia', () => {
      const r = resolveSubscription(
        input({ currentPeriodEnd: new Date('2026-08-10T12:00:00Z') }), // -7
        config,
        now,
      );
      expect(r.state).toBe('GRACE');
      expect(r.daysRemaining).toBe(-7);
    });

    it('pasa a EXPIRED recién al superar la gracia', () => {
      const r = resolveSubscription(
        input({ currentPeriodEnd: new Date('2026-08-06T12:00:00Z') }), // -11
        config,
        now,
      );
      expect(r.state).toBe('EXPIRED');
    });
  });

  describe('baja en Mercado Pago', () => {
    it('respeta el período ya pagado aunque esté cancelada', () => {
      const r = resolveSubscription(
        input({
          subscriptionStatus: 'CANCELLED',
          currentPeriodEnd: new Date('2026-09-17T12:00:00Z'),
        }),
        config,
        now,
      );
      // Pagó el mes completo: le corresponde usarlo hasta el final.
      expect(r.state).toBe('ACTIVE');
    });

    it('queda CANCELLED una vez consumido el período pagado', () => {
      const r = resolveSubscription(
        input({
          subscriptionStatus: 'CANCELLED',
          currentPeriodEnd: new Date('2026-08-01T12:00:00Z'),
        }),
        config,
        now,
      );
      expect(r.state).toBe('CANCELLED');
      expect(r.shouldWarn).toBe(true);
    });
  });

  describe('políticas de bloqueo', () => {
    const expired = input({
      currentPeriodEnd: new Date('2026-07-01T12:00:00Z'),
    });

    it('WARN_ONLY nunca bloquea, ni siquiera vencido hace rato', () => {
      const r = resolveSubscription(
        { ...expired, enforcementPolicy: 'WARN_ONLY' },
        config,
        now,
      );
      expect(r.state).toBe('EXPIRED');
      expect(r.blocksWrites).toBe(false);
      expect(r.blocksAccess).toBe(false);
    });

    it('READ_ONLY bloquea escrituras pero no el acceso', () => {
      const r = resolveSubscription(
        { ...expired, enforcementPolicy: 'READ_ONLY' },
        config,
        now,
      );
      expect(r.blocksWrites).toBe(true);
      expect(r.blocksAccess).toBe(false);
    });

    it('BLOCK bloquea todo', () => {
      const r = resolveSubscription(
        { ...expired, enforcementPolicy: 'BLOCK' },
        config,
        now,
      );
      expect(r.blocksWrites).toBe(true);
      expect(r.blocksAccess).toBe(true);
    });

    it('ninguna política bloquea mientras esté en gracia', () => {
      const inGrace = input({
        currentPeriodEnd: new Date('2026-08-15T12:00:00Z'),
        enforcementPolicy: 'BLOCK',
      });
      const r = resolveSubscription(inGrace, config, now);
      expect(r.state).toBe('GRACE');
      expect(r.blocksAccess).toBe(false);
    });
  });

  it('trata como activo a un tenant sin fechas (previo a la migración)', () => {
    const r = resolveSubscription(input(), config, now);
    expect(r.state).toBe('ACTIVE');
    expect(r.shouldWarn).toBe(false);
    expect(r.blocksAccess).toBe(false);
    // Tiene que sobrevivir a JSON.stringify: con Infinity se serializaría
    // como null y rompería el tipo `number` del otro lado del cable.
    expect(Number.isFinite(r.daysRemaining)).toBe(true);
    const roundTripped = JSON.parse(JSON.stringify(r)) as {
      daysRemaining: number | null;
    };
    expect(roundTripped.daysRemaining).toBe(r.daysRemaining);
  });
});
