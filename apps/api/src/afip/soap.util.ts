import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false });

// Único punto donde se "confía" en la forma de una respuesta XML externa
// (WSAA/WSFE) — todo el resto del módulo trabaja con las interfaces
// tipadas que definen cada caller, no con el `any` que devuelve el parser.
export function parseXml<T>(xml: string): T {
  return parser.parse(xml) as T;
}

export async function postSoap(url: string, envelope: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', SOAPAction: '' },
    body: envelope,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AFIP respondió ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.text();
}

export function formatAfipDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export function parseAfipDate(s: string): Date {
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
}
