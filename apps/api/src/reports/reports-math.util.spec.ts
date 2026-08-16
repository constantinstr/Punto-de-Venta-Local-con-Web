import {
  computeVatByRate,
  computeAverageTicket,
  computeGrossMargin,
  computePaymentPercentage,
  round2,
} from './reports-math.util';

describe('computeVatByRate', () => {
  it('calcula el IVA contenido en un total con IVA incluido (21%)', () => {
    // $1210 con IVA 21% incluido -> neto $1000, IVA $210
    const result = computeVatByRate([{ taxRate: 21, sumTotal: 1210 }]);
    expect(result).toEqual([{ rate: 21, amount: 210 }]);
  });

  it('calcula correctamente para 10.5%', () => {
    // $1105 con IVA 10.5% incluido -> neto $1000, IVA $105
    const result = computeVatByRate([{ taxRate: 10.5, sumTotal: 1105 }]);
    expect(result).toEqual([{ rate: 10.5, amount: 105 }]);
  });

  it('alícuota 0% no aporta IVA', () => {
    const result = computeVatByRate([{ taxRate: 0, sumTotal: 500 }]);
    expect(result).toEqual([{ rate: 0, amount: 0 }]);
  });

  it('agrupa varias alícuotas independientemente', () => {
    const result = computeVatByRate([
      { taxRate: 21, sumTotal: 1210 },
      { taxRate: 10.5, sumTotal: 1105 },
      { taxRate: 0, sumTotal: 300 },
    ]);
    expect(result).toEqual([
      { rate: 21, amount: 210 },
      { rate: 10.5, amount: 105 },
      { rate: 0, amount: 0 },
    ]);
  });

  it('descarta grupos con suma cero (alícuota sin ventas en el período)', () => {
    const result = computeVatByRate([{ taxRate: 21, sumTotal: 0 }]);
    expect(result).toEqual([]);
  });
});

describe('computeAverageTicket', () => {
  it('divide facturación bruta por cantidad de tickets', () => {
    expect(computeAverageTicket(10000, 40)).toBe(250);
  });

  it('devuelve 0 sin dividir por cero cuando no hay tickets', () => {
    expect(computeAverageTicket(0, 0)).toBe(0);
  });

  it('redondea a centavos', () => {
    expect(computeAverageTicket(100, 3)).toBe(33.33);
  });
});

describe('computeGrossMargin', () => {
  it('neto menos costo total', () => {
    expect(computeGrossMargin(10000, 6000)).toBe(4000);
  });

  it('permite margen negativo (venta bajo costo)', () => {
    expect(computeGrossMargin(1000, 1500)).toBe(-500);
  });
});

describe('computePaymentPercentage', () => {
  it('calcula el porcentaje sobre el total recaudado', () => {
    expect(computePaymentPercentage(2500, 10000)).toBe(25);
  });

  it('devuelve 0 sin dividir por cero cuando no hubo recaudación', () => {
    expect(computePaymentPercentage(0, 0)).toBe(0);
  });
});

describe('round2', () => {
  it('corrige artefactos de punto flotante', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
