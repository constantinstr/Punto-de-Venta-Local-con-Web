import { Injectable } from '@nestjs/common';
import { AfipAuthService } from './afip-auth.service';
import { parseXml, postSoap, formatAfipDate, parseAfipDate } from './soap.util';
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

// Implementación real de WSFE v1. Igual que AfipAuthService, no se pudo
// probar contra AFIP homologación real en este entorno (sin certificados
// de prueba) — implementado siguiendo el manual para desarrolladores de
// WSFE v1 de AFIP, pendiente de primera prueba real. AfipMockGateway (ver
// afip-mock.gateway.ts) es lo que efectivamente corre en los tests e2e.
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
    const responseXml = await postSoap(url, envelope);
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

    const alicuotasXml = request.alicuotas
      .map(
        (a) =>
          `<ar:AlicIva><ar:Id>${a.id}</ar:Id><ar:BaseImp>${a.baseImponible.toFixed(2)}</ar:BaseImp><ar:Importe>${a.importe.toFixed(2)}</ar:Importe></ar:AlicIva>`,
      )
      .join('');

    const envelope =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">\n' +
      '  <soapenv:Header/>\n' +
      '  <soapenv:Body>\n' +
      '    <ar:FECAESolicitar>\n' +
      '      <ar:Auth>\n' +
      `        <ar:Token>${token}</ar:Token>\n` +
      `        <ar:Sign>${sign}</ar:Sign>\n` +
      `        <ar:Cuit>${credential.cuit}</ar:Cuit>\n` +
      '      </ar:Auth>\n' +
      '      <ar:FeCAEReq>\n' +
      '        <ar:FeCabReq>\n' +
      '          <ar:CantReg>1</ar:CantReg>\n' +
      `          <ar:PtoVta>${credential.ptoVta}</ar:PtoVta>\n` +
      `          <ar:CbteTipo>${request.cbteTipo}</ar:CbteTipo>\n` +
      '        </ar:FeCabReq>\n' +
      '        <ar:FeDetReq>\n' +
      '          <ar:FECAEDetRequest>\n' +
      '            <ar:Concepto>1</ar:Concepto>\n' +
      `            <ar:DocTipo>${request.docTipo}</ar:DocTipo>\n` +
      `            <ar:DocNro>${request.docNro}</ar:DocNro>\n` +
      `            <ar:CbteDesde>${request.cbteNro}</ar:CbteDesde>\n` +
      `            <ar:CbteHasta>${request.cbteNro}</ar:CbteHasta>\n` +
      `            <ar:CbteFch>${formatAfipDate(new Date())}</ar:CbteFch>\n` +
      `            <ar:ImpTotal>${request.importeTotal.toFixed(2)}</ar:ImpTotal>\n` +
      `            <ar:ImpTotConc>${request.importeNoGravado.toFixed(2)}</ar:ImpTotConc>\n` +
      `            <ar:ImpNeto>${request.importeNeto.toFixed(2)}</ar:ImpNeto>\n` +
      `            <ar:ImpOpEx>${request.importeExento.toFixed(2)}</ar:ImpOpEx>\n` +
      `            <ar:ImpIVA>${request.importeIva.toFixed(2)}</ar:ImpIVA>\n` +
      '            <ar:ImpTrib>0.00</ar:ImpTrib>\n' +
      '            <ar:MonId>PES</ar:MonId>\n' +
      '            <ar:MonCotiz>1</ar:MonCotiz>\n' +
      `            <ar:Iva>${alicuotasXml}</ar:Iva>\n` +
      '          </ar:FECAEDetRequest>\n' +
      '        </ar:FeDetReq>\n' +
      '      </ar:FeCAEReq>\n' +
      '    </ar:FECAESolicitar>\n' +
      '  </soapenv:Body>\n' +
      '</soapenv:Envelope>';

    const url = credential.isProduction
      ? WSFE_URL.produccion
      : WSFE_URL.homologacion;
    const responseXml = await postSoap(url, envelope);
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
