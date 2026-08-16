import { Injectable } from '@nestjs/common';
import type {
  AfipCredentialInput,
  AfipGateway,
  FeCaeRequest,
  FeCaeResult,
} from './afip-gateway.interface';

// Simula WSFE sin tocar la red — para tests e2e y para desarrollo sin
// certificados reales de AFIP a mano. Se activa vía AFIP_MOCK=true (ver
// afip.module.ts) o se inyecta directamente overrideando AFIP_GATEWAY en
// el testing module de Nest.
//
// Para simular un rechazo desde un test, se manda docNro=11111111 — es un
// valor mágico documentado acá, no un caso real de la tabla de AFIP.
const FORCE_REJECT_DOC_NRO = 11111111;

@Injectable()
export class AfipMockGateway implements AfipGateway {
  // último número emitido por (cuit, ptoVta, cbteTipo), en memoria —
  // suficiente para simular la correlatividad dentro de un proceso de test.
  private readonly lastVoucherByKey = new Map<string, number>();

  getLastVoucherNumber(
    credential: AfipCredentialInput,
    cbteTipo: number,
  ): Promise<number> {
    const key = `${credential.cuit}:${credential.ptoVta}:${cbteTipo}`;
    return Promise.resolve(this.lastVoucherByKey.get(key) ?? 0);
  }

  solicitarCae(
    credential: AfipCredentialInput,
    request: FeCaeRequest,
  ): Promise<FeCaeResult> {
    if (request.docNro === FORCE_REJECT_DOC_NRO) {
      return Promise.resolve({
        approved: false,
        observaciones:
          '10015: Documento del receptor inválido (rechazo simulado por AfipMockGateway)',
        raw: { mock: true, resultado: 'R', observaciones: [{ code: 10015 }] },
      });
    }

    const key = `${credential.cuit}:${credential.ptoVta}:${request.cbteTipo}`;
    this.lastVoucherByKey.set(key, request.cbteNro);

    const caeVto = new Date();
    caeVto.setDate(caeVto.getDate() + 10);

    return Promise.resolve({
      approved: true,
      cae: `MOCK${Date.now()}`.padEnd(14, '0').slice(0, 14),
      caeVto,
      raw: { mock: true, resultado: 'A', cae: 'mock' },
    });
  }
}
