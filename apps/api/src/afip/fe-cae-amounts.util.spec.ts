import { buildFeCaeAmounts } from './fe-cae-amounts.util';

describe('buildFeCaeAmounts', () => {
  it('un solo ítem IVA 21% -> neto/iva correctos y una sola alícuota', () => {
    const result = buildFeCaeAmounts([
      { total: 121, vatCondition: 'IVA_21', taxRate: 21 },
    ]);

    expect(result.importeTotal).toBe(121);
    expect(result.importeNeto).toBe(100);
    expect(result.importeIva).toBe(21);
    expect(result.importeExento).toBe(0);
    expect(result.importeNoGravado).toBe(0);
    expect(result.alicuotas).toEqual([
      { id: 5, baseImponible: 100, importe: 21 },
    ]);
  });

  it('agrupa varios ítems de la misma alícuota en una sola línea', () => {
    const result = buildFeCaeAmounts([
      { total: 121, vatCondition: 'IVA_21', taxRate: 21 },
      { total: 242, vatCondition: 'IVA_21', taxRate: 21 },
    ]);
    expect(result.alicuotas).toHaveLength(1);
    expect(result.alicuotas[0].baseImponible).toBe(300); // 100 + 200
    expect(result.alicuotas[0].importe).toBe(63); // 21 + 42
  });

  it('Exento y No Gravado no entran en el array de alícuotas', () => {
    const result = buildFeCaeAmounts([
      { total: 121, vatCondition: 'IVA_21', taxRate: 21 },
      { total: 50, vatCondition: 'EXENTO', taxRate: 0 },
      { total: 30, vatCondition: 'NO_GRAVADO', taxRate: 0 },
    ]);

    expect(result.importeTotal).toBe(201);
    expect(result.importeExento).toBe(50);
    expect(result.importeNoGravado).toBe(30);
    expect(result.alicuotas).toHaveLength(1); // solo IVA_21
    expect(result.importeNeto).toBe(100); // no incluye exento/no gravado
  });

  it('mezcla de alícuotas 21% y 10.5% produce dos líneas separadas', () => {
    const result = buildFeCaeAmounts([
      { total: 121, vatCondition: 'IVA_21', taxRate: 21 },
      { total: 110.5, vatCondition: 'IVA_10_5', taxRate: 10.5 },
    ]);

    expect(result.alicuotas).toHaveLength(2);
    const iva21 = result.alicuotas.find((a) => a.id === 5)!;
    const iva105 = result.alicuotas.find((a) => a.id === 4)!;
    expect(iva21.baseImponible).toBe(100);
    expect(iva105.baseImponible).toBe(100);
  });

  it('carrito vacío da todo en cero sin explotar', () => {
    const result = buildFeCaeAmounts([]);
    expect(result.importeTotal).toBe(0);
    expect(result.alicuotas).toHaveLength(0);
  });
});
