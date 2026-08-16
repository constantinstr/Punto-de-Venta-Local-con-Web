import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConnection } from '../redis/redis-connection';
import { buildTraXml } from './tra.util';
import { signTra } from './cms-signer';
import { parseXml, postSoap } from './soap.util';

const WSAA_URL = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
};

export interface AccessTicket {
  token: string;
  sign: string;
}

interface LoginTicketResponseXml {
  loginTicketResponse: {
    header: { expirationTime: string };
    credentials: { token: string; sign: string };
  };
}

// SOAP no exige un prefijo de namespace fijo para soapenv:/soap: — se
// busca la clave por sufijo para no romper si AFIP responde con un
// prefijo distinto al que se usó de ejemplo al armar esto.
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

// Ver docs/afip.md §1. El Ticket de Acceso (TA) vale 12hs; se cachea en
// Redis con la sesión/proceso completamente al margen de la base — nunca
// se persiste en Postgres (a diferencia del diseño original de Fase 1),
// evitando guardar un token de sesión de larga vida en una tabla.
//
// NOTA DE IMPLEMENTACIÓN: este servicio no se pudo probar contra el WSAA
// real de AFIP (no hay certificados de homologación disponibles en este
// entorno) — está implementado siguiendo al pie de la letra la
// especificación WSAA, pero la primera prueba real contra
// wsaahomo.afip.gov.ar queda pendiente para cuando exista un CUIT de
// prueba con certificado habilitado.
@Injectable()
export class AfipAuthService implements OnModuleDestroy {
  private readonly logger = new Logger(AfipAuthService.name);
  private readonly redis = new Redis(getRedisConnection());

  // Sin esto, el cliente ioredis deja un socket abierto que nunca se cierra
  // solo — cuelga tanto `nest start` en shutdown como los tests e2e (Jest
  // no termina el proceso aunque todos los tests ya hayan pasado).
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async getAccessTicket(credential: {
    storeId: string;
    crtCertificate: string;
    keyCertificate: string;
    isProduction: boolean;
  }): Promise<AccessTicket> {
    const cacheKey = `afip:ta:${credential.storeId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as AccessTicket;

    this.logger.log(
      `Solicitando nuevo Ticket de Acceso WSAA para store=${credential.storeId}`,
    );

    const traXml = buildTraXml('wsfe');
    const cms = signTra(
      traXml,
      credential.crtCertificate,
      credential.keyCertificate,
    );
    const url = credential.isProduction
      ? WSAA_URL.produccion
      : WSAA_URL.homologacion;
    const envelope = this.buildLoginCmsEnvelope(cms);

    const responseXml = await postSoap(url, envelope);
    const { token, sign, expirationTime } =
      this.parseLoginTicketResponse(responseXml);

    // Margen de 5 minutos antes del vencimiento real, para no arriesgarse
    // a usar un token que expira mientras viaja la request a WSFE.
    const ttlSeconds = Math.max(
      60,
      Math.floor((expirationTime.getTime() - Date.now()) / 1000) - 5 * 60,
    );
    await this.redis.set(
      cacheKey,
      JSON.stringify({ token, sign }),
      'EX',
      ttlSeconds,
    );

    return { token, sign };
  }

  private buildLoginCmsEnvelope(cms: string): string {
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.afip.gov">\n' +
      '  <soapenv:Header/>\n' +
      '  <soapenv:Body>\n' +
      '    <wsaa:loginCms>\n' +
      `      <wsaa:in0>${cms}</wsaa:in0>\n` +
      '    </wsaa:loginCms>\n' +
      '  </soapenv:Body>\n' +
      '</soapenv:Envelope>'
    );
  }

  private parseLoginTicketResponse(responseXml: string): {
    token: string;
    sign: string;
    expirationTime: Date;
  } {
    const envelope = parseXml<Record<string, unknown>>(responseXml);
    const body = unwrapSoapBody(envelope);
    const loginCmsResponse = body.loginCmsResponse as {
      loginCmsReturn: string;
    };
    const ticket = parseXml<LoginTicketResponseXml>(
      loginCmsResponse.loginCmsReturn,
    );

    return {
      token: ticket.loginTicketResponse.credentials.token,
      sign: ticket.loginTicketResponse.credentials.sign,
      expirationTime: new Date(
        ticket.loginTicketResponse.header.expirationTime,
      ),
    };
  }
}
