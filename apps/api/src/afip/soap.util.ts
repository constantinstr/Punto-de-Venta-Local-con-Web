import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false });

// Único punto donde se "confía" en la forma de una respuesta XML externa
// (WSAA/WSFE) — todo el resto del módulo trabaja con las interfaces
// tipadas que definen cada caller, no con el `any` que devuelve el parser.
export function parseXml<T>(xml: string): T {
  return parser.parse(xml) as T;
}

// El header SOAPAction NO es opcional para WSFE.
//
// WSAA corre sobre Apache Axis y lo ignora, así que un SOAPAction vacío
// funciona. WSFE, en cambio, es un servicio ASP.NET (.asmx) y lo usa para
// despachar al método: si va vacío, AFIP responde **HTTP 200 con una página
// HTML** en vez de SOAP, y el parseo falla después con un críptico
// "Respuesta SOAP sin Envelope" que no dice nada del verdadero motivo.
// Verificado contra wswhomo.afip.gov.ar el 17/08/2026:
//   SOAPAction=''                                  -> <html>…</html>
//   SOAPAction='http://ar.gov.afip.dif.FEV1/FEDummy' -> Envelope correcto
export async function postSoap(
  url: string,
  envelope: string,
  soapAction = '',
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      SOAPAction: soapAction,
    },
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
