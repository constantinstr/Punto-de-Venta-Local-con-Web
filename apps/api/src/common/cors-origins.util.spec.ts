import { parseCorsOrigins } from './cors-origins.util';

describe('parseCorsOrigins', () => {
  it('parsea una lista separada por comas', () => {
    expect(parseCorsOrigins('https://a.com,https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('recorta espacios alrededor de cada origen', () => {
    expect(parseCorsOrigins(' https://a.com , https://b.com ')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('cae al default de desarrollo si no está seteada', () => {
    expect(parseCorsOrigins(undefined)).toEqual(['http://localhost:3000']);
  });

  it('cae al default de desarrollo si está vacía', () => {
    expect(parseCorsOrigins('')).toEqual(['http://localhost:3000']);
    expect(parseCorsOrigins('   ')).toEqual(['http://localhost:3000']);
  });

  it('descarta entradas vacías por comas de más', () => {
    expect(parseCorsOrigins('https://a.com,,https://b.com,')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('soporta un único origen', () => {
    expect(parseCorsOrigins('https://pos.midominio.com')).toEqual([
      'https://pos.midominio.com',
    ]);
  });
});
