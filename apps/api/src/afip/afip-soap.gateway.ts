import { Injectable } from '@nestjs/common';
import { AfipAuthService } from './afip-auth.service';
import { parseXml, postSoap, formatAfipDate, parseAfipDate } from './soap.util';
import { buildFeCaeEnvelope } from './fe-cae-envelope.util';
import type {
  AfipCredentialInput,
  AfipGateway,
  FeCaeRequest,
  FeCaeResult,
} from './afip-gateway.interface';

const WSFE_URL = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};

// WSFE es ASP.NET (.asmx) y despacha por el header SOAPAction — sin él
// devuelve HTML en vez de SOAP. Ver el comentario en soap.util.ts postSoap().
const SOAP_ACTION = {
  ultimoAutorizado: 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
  solicitarCae: 'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
};

function unwrapSoapBody(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const envelopeKey =
    Object.keys(parsed).find((k) => k.endsWith(':Envelope')) ?? 'Envelope';
  const envelope = parsed[envelopeKey] as Record<string, unknown> | undefined;
  if (!envelope) throw new Error('Respuesta SOAP sin Envelope');
  const bodyKey =
    Object.keys(envelope).find((k) => k.endsWith(':Body')) ?? 'Body';
  const body = envelope[bodyKey] as Record<string, unknown> | undefined;
  if (!body) throw new Error('Respuesta SOAP sin Body');
  return body;
}

interface FeCompUltimoAutorizadoResponseXml {
  FECompUltimoAutorizadoResponse: {
    FECompUltimoAutorizadoResult: { CbteNro?: number };
  };
}

interface AfipObservacion {
  Code: number;
  Msg: string;
}

interface FeCaeDetResponseXml {
  Resultado: string; // "A" aprobado | "R" rechazado
  CAE?: string;
  CAEFchVto?: string;
  Observaciones?: { Obs: AfipObservacion | AfipObservacion[] };
}

interface FeCaeSolicitarResponseXml {
  FECAESolicitarResponse: {
    FECAESolicitarResult: {
      FeDetResp: { FECAEDetResponse: FeCaeDetResponseXml };
    };
  };
}

// Implementación real de WSFE v1. VERIFICADA contra homologación el
// 17/08/2026: CAE 86330767035026 obtenido para Factura C nº 1, PtoVta 4,
// CUIT 20336931100. AfipMockGateway (ver afip-mock.gateway.ts) sigue siendo
// lo que corre en los tests e2e, para no depender de AFIP en CI.
//
// Las tres cosas que costaron esa primera emisión, por si vuelven a aparecer:
//   1. SOAPAction obligatorio (WSFE es ASP.NET) — ver postSoap().
//   2. CondicionIVAReceptorId obligatorio desde la RG 5616.
//   3. La clase C no lleva IVA ni el nodo <Iva> — ver adaptAmountsToCbteTipo().
@Injectable()
export class AfipSoapGateway implements AfipGateway {
  constructor(private readonly authService: AfipAuthService) {}

  async getLastVoucherNumber(
    credential: AfipCredentialInput,
    cbteTipo: number,
  ): Promise<number> {
    const { token, sign } = await this.authService.getAccessTicket(credential);

    const envelope =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">\n' +
      '  <soapenv:Header/>\n' +
      '  <soapenv:Body>\n' +
      '    <ar:FECompUltimoAutorizado>\n' +
      '      <ar:Auth>\n' +
      `        <ar:Token>${token}</ar:Token>\n` +
      `        <ar:Sign>${sign}</ar:Sign>\n` +
      `        <ar:Cuit>${credential.cuit}</ar:Cuit>\n` +
      '      </ar:Auth>\n' +
      `      <ar:PtoVta>${credential.ptoVta}</ar:PtoVta>\n` +
      `      <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>\n` +
      '    </ar:FECompUltimoAutorizado>\n' +
      '  </soapenv:Body>\n' +
      '</soapenv:Envelope>';

    const url = credential.isProduction
      ? WSFE_URL.produccion
      : WSFE_URL.homologacion;
    const responseXml = await postSoap(
      url,
      envelope,
      SOAP_ACTION.ultimoAutorizado,
    );
    const body = unwrapSoapBody(parseXml<Record<string, unknown>>(responseXml));
    const result = body as unknown as FeCompUltimoAutorizadoResponseXml;

    return Number(
      result.FECompUltimoAutorizadoResponse.FECompUltimoAutorizadoResult
        .CbteNro ?? 0,
    );
  }

  async solicitarCae(
    credential: AfipCredentialInput,
    request: FeCaeRequest,
  ): Promise<FeCaeResult> {
    const { token, sign } = await this.authService.getAccessTicket(credential);

    // El armado del XML vive en una función pura y testeada aparte
    // (fe-cae-envelope.util.ts): es donde están las reglas por tipo de
    // comprobante (clase C sin IVA, CbtesAsoc en notas de crédito) y donde
    // se cubren Factura A/B/C sin depender de la red.
    const envelope = buildFeCaeEnvelope(
      { token, sign, cuit: credential.cuit },
      { ptoVta: credential.ptoVta },
      request,
      formatAfipDate(new Date()),
    );

    const url = credential.isProduction
      ? WSFE_URL.produccion
      : WSFE_URL.homologacion;
    const responseXml = await postSoap(url, envelope, SOAP_ACTION.solicitarCae);
    const body = unwrapSoapBody(parseXml<Record<string, unknown>>(responseXml));
    const result = body as unknown as FeCaeSolicitarResponseXml;
    const detalle =
      result.FECAESolicitarResponse.FECAESolicitarResult.FeDetResp
        .FECAEDetResponse;

    if (detalle.Resultado !== 'A') {
      const obs = detalle.Observaciones?.Obs;
      const observaciones = obs
        ? (Array.isArray(obs) ? obs : [obs])
            .map((o) => `${o.Code}: ${o.Msg}`)
            .join('; ')
        : 'Rechazado por AFIP sin detalle de observaciones';
      return { approved: false, observaciones, raw: detalle };
    }

    return {
      approved: true,
      cae: String(detalle.CAE),
      caeVto: parseAfipDate(String(detalle.CAEFchVto)),
      raw: detalle,
    };
  }
}
