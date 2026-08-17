// Abstracción sobre WSFE (AFIP) — permite que InvoicesService no sepa si
// habla con AFIP de verdad o con un mock. En tests e2e, AfipModule expone
// AfipMockGateway bajo el mismo token para no depender de conectividad
// real con AFIP (ver docs/afip.md y test/invoices.e2e-spec.ts).
export const AFIP_GATEWAY = Symbol('AFIP_GATEWAY');

export interface AfipCredentialInput {
  storeId: string;
  cuit: string;
  ptoVta: number;
  crtCertificate: string;
  keyCertificate: string;
  isProduction: boolean;
}

export interface FeCaeAlicuota {
  id: number; // AFIP_ALICUOTA_ID
  baseImponible: number;
  importe: number;
}

// Comprobante asociado (<CbtesAsoc>). Obligatorio en notas de crédito:
// identifica la factura que se está anulando.
export interface CbteAsociado {
  tipo: number; // AFIP_CBTE_TIPO del comprobante original
  ptoVta: number;
  nro: number;
  cuit: string; // CUIT del EMISOR del comprobante original
}

export interface FeCaeRequest {
  cbteTipo: number; // AFIP_CBTE_TIPO
  docTipo: number; // AFIP_DOC_TIPO
  docNro: number;
  // Obligatorio desde la RG 5616 — ver AFIP_CONDICION_IVA_RECEPTOR.
  condicionIvaReceptorId: number;
  // Solo en notas de crédito.
  cbtesAsoc?: CbteAsociado[];
  cbteNro: number;
  importeTotal: number;
  importeNeto: number;
  importeIva: number;
  importeExento: number; // ImpOpEx
  importeNoGravado: number; // ImpTotConc
  alicuotas: FeCaeAlicuota[];
}

export interface FeCaeResult {
  approved: boolean;
  cae?: string;
  caeVto?: Date;
  observaciones?: string; // motivo de rechazo, si approved=false
  raw: unknown; // respuesta cruda de AFIP, para auditoría (Invoice.afipResponse)
}

export interface AfipGateway {
  // Último comprobante autorizado para ese punto de venta + tipo — el
  // siguiente cbteNro a pedir es este valor + 1 (FECompUltimoAutorizado).
  getLastVoucherNumber(
    credential: AfipCredentialInput,
    cbteTipo: number,
  ): Promise<number>;

  solicitarCae(
    credential: AfipCredentialInput,
    request: FeCaeRequest,
  ): Promise<FeCaeResult>;
}
