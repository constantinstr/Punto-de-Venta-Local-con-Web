import type { FeCaeRequest } from './afip-gateway.interface';

// Comprobantes "clase C" (emisor Monotributo): Factura C y Nota de Crédito C.
// Ver AFIP_CBTE_TIPO en invoice-type.util.ts.
const CBTE_TIPO_CLASE_C = new Set([11, 13]);

export interface FeCaeEnvelopeAuth {
  token: string;
  sign: string;
  cuit: string;
}

export interface FeCaeEnvelopeCredential {
  ptoVta: number;
}

// La clase C NO discrimina IVA: el monotributista no lo liquida. Mandar el
// desglose como si fuera una Factura B hace que AFIP rechace con tres
// errores a la vez (verificado contra homologación el 17/08/2026):
//   10047: ImpIVA para comprobantes tipo C debe ser igual a cero
//   10048: ImpTotal debe ser igual a ImpNeto + ImpTrib
//   10071: Para comprobantes tipo C el objeto IVA no debe informarse
// Es decir: todo el importe va a ImpNeto, el resto en cero, y el nodo <Iva>
// no se manda en absoluto (no alcanza con mandarlo vacío).
export function adaptAmountsToCbteTipo(request: FeCaeRequest): {
  impNeto: number;
  impIva: number;
  impOpEx: number;
  impTotConc: number;
  incluirIva: boolean;
} {
  if (CBTE_TIPO_CLASE_C.has(request.cbteTipo)) {
    return {
      impNeto: request.importeTotal,
      impIva: 0,
      impOpEx: 0,
      impTotConc: 0,
      incluirIva: false,
    };
  }
  return {
    impNeto: request.importeNeto,
    impIva: request.importeIva,
    impOpEx: request.importeExento,
    impTotConc: request.importeNoGravado,
    incluirIva: true,
  };
}

// Arma el envelope de FECAESolicitar. Función pura y sin red a propósito:
// es lo que permite testear el XML de Factura A, B, C y notas de crédito sin
// depender de AFIP ni de certificados (ver fe-cae-envelope.util.spec.ts).
//
// El orden de los nodos NO es arbitrario: FECAEDetRequest es una <sequence>
// en el XSD de WSFE, y CbtesAsoc va después de CondicionIVAReceptorId y
// antes de Iva.
export function buildFeCaeEnvelope(
  auth: FeCaeEnvelopeAuth,
  credential: FeCaeEnvelopeCredential,
  request: FeCaeRequest,
  cbteFch: string,
): string {
  const montos = adaptAmountsToCbteTipo(request);

  const alicuotasXml = request.alicuotas
    .map(
      (a) =>
        `<ar:AlicIva><ar:Id>${a.id}</ar:Id><ar:BaseImp>${a.baseImponible.toFixed(2)}</ar:BaseImp><ar:Importe>${a.importe.toFixed(2)}</ar:Importe></ar:AlicIva>`,
    )
    .join('');
  // En clase C el nodo se omite entero: AFIP rechaza incluso un <Iva/> vacío.
  const ivaXml = montos.incluirIva
    ? `            <ar:Iva>${alicuotasXml}</ar:Iva>\n`
    : '';

  // Obligatorio en notas de crédito: identifica qué comprobante se anula.
  // Sin esto AFIP rechaza la NC (error 10062 y familia).
  const cbtesAsocXml = request.cbtesAsoc?.length
    ? `            <ar:CbtesAsoc>${request.cbtesAsoc
        .map(
          (c) =>
            `<ar:CbteAsoc><ar:Tipo>${c.tipo}</ar:Tipo><ar:PtoVta>${c.ptoVta}</ar:PtoVta><ar:Nro>${c.nro}</ar:Nro><ar:Cuit>${c.cuit}</ar:Cuit></ar:CbteAsoc>`,
        )
        .join('')}</ar:CbtesAsoc>\n`
    : '';

  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">\n' +
    '  <soapenv:Header/>\n' +
    '  <soapenv:Body>\n' +
    '    <ar:FECAESolicitar>\n' +
    '      <ar:Auth>\n' +
    `        <ar:Token>${auth.token}</ar:Token>\n` +
    `        <ar:Sign>${auth.sign}</ar:Sign>\n` +
    `        <ar:Cuit>${auth.cuit}</ar:Cuit>\n` +
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
    `            <ar:CbteFch>${cbteFch}</ar:CbteFch>\n` +
    `            <ar:ImpTotal>${request.importeTotal.toFixed(2)}</ar:ImpTotal>\n` +
    `            <ar:ImpTotConc>${montos.impTotConc.toFixed(2)}</ar:ImpTotConc>\n` +
    `            <ar:ImpNeto>${montos.impNeto.toFixed(2)}</ar:ImpNeto>\n` +
    `            <ar:ImpOpEx>${montos.impOpEx.toFixed(2)}</ar:ImpOpEx>\n` +
    `            <ar:ImpIVA>${montos.impIva.toFixed(2)}</ar:ImpIVA>\n` +
    '            <ar:ImpTrib>0.00</ar:ImpTrib>\n' +
    '            <ar:MonId>PES</ar:MonId>\n' +
    '            <ar:MonCotiz>1</ar:MonCotiz>\n' +
    // Obligatorio desde la RG 5616 — ver AFIP_CONDICION_IVA_RECEPTOR.
    `            <ar:CondicionIVAReceptorId>${request.condicionIvaReceptorId}</ar:CondicionIVAReceptorId>\n` +
    cbtesAsocXml +
    ivaXml +
    '          </ar:FECAEDetRequest>\n' +
    '        </ar:FeDetReq>\n' +
    '      </ar:FeCAEReq>\n' +
    '    </ar:FECAESolicitar>\n' +
    '  </soapenv:Body>\n' +
    '</soapenv:Envelope>'
  );
}
