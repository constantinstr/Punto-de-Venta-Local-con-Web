# Módulo AFIP — WSAA + WSFE v1

Objetivo: emitir Facturas A/B/C y Notas de Crédito con CAE, respetando el
flujo oficial de dos web services de AFIP. Se aísla en su propio módulo
porque tiene requisitos distintos al resto de la API (SOAP, firma CMS,
certificados por tenant/local, ambientes homologación/producción).

## 1. WSAA — Web Service de Autenticación y Autorización

El TA (Ticket de Acceso) obtenido es válido por **12 horas** y se
comparte para todos los requests WSFE de ese punto de venta durante ese
lapso — no se pide uno nuevo por cada factura. Se cachea en
`AfipCredential.taToken` / `taSign` / `taExpirationTime`.

### Paso 1 — Generar el TRA (Ticket de Requerimiento de Acceso), un XML:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>{{ timestamp_unix }}</uniqueId>
    <generationTime>{{ now - 10min, ISO8601 }}</generationTime>
    <expirationTime>{{ now + 10min, ISO8601 }}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>
```

### Paso 2 — Firmar el TRA en formato CMS/PKCS#7 (con el `.crt`/`.key` del tenant):

```ts
// apps/afip-worker/src/wsaa/sign-tra.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export async function signTra(traXml: string, cert: string, key: string): Promise<string> {
  const dir = tmpdir();
  const traPath = join(dir, `tra-${Date.now()}.xml`);
  const certPath = join(dir, `cert-${Date.now()}.crt`);
  const keyPath = join(dir, `key-${Date.now()}.key`);

  await Promise.all([
    writeFile(traPath, traXml),
    writeFile(certPath, cert),
    writeFile(keyPath, key),
  ]);

  try {
    // openssl smime -sign -in tra.xml -signer cert.crt -inkey key.key -outform DER -nodetach
    const { stdout } = await execFileAsync("openssl", [
      "smime", "-sign",
      "-in", traPath,
      "-signer", certPath,
      "-inkey", keyPath,
      "-outform", "DER",
      "-nodetach",
    ], { encoding: "binary", maxBuffer: 1024 * 1024 });

    return Buffer.from(stdout, "binary").toString("base64");
  } finally {
    await Promise.all([unlink(traPath), unlink(certPath), unlink(keyPath)]);
  }
}
```

> Nota: en producción, `cert`/`key` se leen ya desencriptados desde el
> secret manager (nunca se persisten en disco fuera de este uso transitorio
> en `tmpdir`, borrados inmediatamente después de firmar).

### Paso 3 — Enviar el CMS firmado al WSAA (SOAP) y guardar el TA:

```ts
// apps/afip-worker/src/wsaa/get-access-ticket.ts
import { XMLParser } from "fast-xml-parser";
import soapRequest from "easy-soap-request";

const WSAA_URL = {
  homologacion: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  produccion: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
};

export async function requestAccessTicket(cms: string, environment: "homologacion" | "produccion") {
  const envelope = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.afip.gov">
      <soapenv:Header/>
      <soapenv:Body>
        <wsaa:loginCms>
          <wsaa:in0>${cms}</wsaa:in0>
        </wsaa:loginCms>
      </soapenv:Body>
    </soapenv:Envelope>`;

  const { response } = await soapRequest({
    url: WSAA_URL[environment],
    headers: { "Content-Type": "text/xml;charset=UTF-8", SOAPAction: "" },
    xml: envelope,
  });

  const parsed = new XMLParser().parse(response.body);
  const loginTicketResponseXml = /* extraer <loginTicketResponse> del <return> */ "";
  const ticket = new XMLParser().parse(loginTicketResponseXml);

  return {
    token: ticket.loginTicketResponse.credentials.token,
    sign: ticket.loginTicketResponse.credentials.sign,
    expirationTime: ticket.loginTicketResponse.header.expirationTime,
  };
}
```

### Cacheo del TA

```ts
export async function getValidAccessTicket(storeId: string) {
  const cred = await prisma.afipCredential.findUniqueOrThrow({ where: { storeId } });

  const stillValid = cred.taExpirationTime && cred.taExpirationTime > addMinutes(new Date(), 5);
  if (stillValid) return { token: cred.taToken!, sign: cred.taSign! };

  const tra = buildTraXml();
  const cms = await signTra(tra, decrypt(cred.certificate), decrypt(cred.privateKey));
  const { token, sign, expirationTime } = await requestAccessTicket(cms, cred.environment as "homologacion" | "produccion");

  await prisma.afipCredential.update({
    where: { storeId },
    data: { taToken: token, taSign: sign, taExpirationTime: new Date(expirationTime), lastTaRequestAt: new Date() },
  });

  return { token, sign };
}
```

## 2. WSFE v1 — Solicitud de CAE (`FECAESolicitar`)

### Payload (mapeo desde `Order` + `OrderItem` a la estructura AFIP):

```ts
interface FeCaeSolicitarPayload {
  Auth: { Token: string; Sign: string; Cuit: string };
  FeCAEReq: {
    FeCabReq: { CantReg: 1; PtoVta: number; CbteTipo: number }; // 1=FacturaA, 6=FacturaB, 11=FacturaC
    FeDetReq: {
      FECAEDetRequest: {
        Concepto: 1; // 1=Productos
        DocTipo: 80 | 96 | 99; // 80=CUIT, 96=DNI, 99=Consumidor Final sin doc
        DocNro: number;
        CbteDesde: number;
        CbteHasta: number;
        CbteFch: string; // YYYYMMDD
        ImpTotal: number;
        ImpTotConc: 0;
        ImpNeto: number;      // neto gravado
        ImpOpEx: 0;
        ImpIVA: number;
        ImpTrib: 0;
        MonId: "PES";
        MonCotiz: 1;
        Iva: {
          AlicIva: Array<{ Id: number; BaseImp: number; Importe: number }>; // Id: 5=21%, 4=10.5%, 3=0%
        };
      };
    };
  };
}
```

```ts
// apps/afip-worker/src/wsfe/build-fecae-payload.ts
const VAT_AFIP_ID: Record<"IVA_21" | "IVA_10_5" | "IVA_0", number> = {
  IVA_21: 5,
  IVA_10_5: 4,
  IVA_0: 3,
};

export function buildFeCaePayload(order: OrderWithItems, cbteTipo: number, cbteNro: number, cuit: string) {
  const itemsByRate = groupItemsByVatCondition(order.items); // Map<VatCondition, OrderItem[]>

  const alicIva = Object.entries(itemsByRate)
    .filter(([cond]) => cond !== "EXENTO" && cond !== "NO_GRAVADO")
    .map(([cond, items]) => ({
      Id: VAT_AFIP_ID[cond as "IVA_21" | "IVA_10_5" | "IVA_0"],
      BaseImp: sum(items.map((i) => i.lineTotal - i.vatAmount)),
      Importe: sum(items.map((i) => i.vatAmount)),
    }));

  return {
    FeCabReq: { CantReg: 1, PtoVta: order.store.afipPointOfSale, CbteTipo: cbteTipo },
    FeDetReq: {
      FECAEDetRequest: {
        Concepto: 1,
        DocTipo: order.customer?.docType === "CUIT" ? 80 : order.customer?.docNumber ? 96 : 99,
        DocNro: order.customer?.docNumber ? Number(order.customer.docNumber) : 0,
        CbteDesde: cbteNro,
        CbteHasta: cbteNro,
        CbteFch: formatDateAfip(new Date()),
        ImpTotal: Number(order.total),
        ImpTotConc: 0,
        ImpNeto: Number(order.total) - Number(order.taxTotal),
        ImpOpEx: 0,
        ImpIVA: Number(order.taxTotal),
        ImpTrib: 0,
        MonId: "PES",
        MonCotiz: 1,
        Iva: { AlicIva: alicIva },
      },
    },
  };
}
```

### Respuesta → persistencia en `Invoice`:

```ts
export async function requestCae(orderId: string) {
  const order = await loadOrderWithItems(orderId);
  const { token, sign } = await getValidAccessTicket(order.storeId);
  const cbteTipo = mapInvoiceTypeToAfipCode(order.invoiceTypeRequested); // A=1, B=6, C=11
  const nextNro = await getNextVoucherNumber(order.store.afipPointOfSale, cbteTipo); // FECompUltimoAutorizado
  const payload = buildFeCaePayload(order, cbteTipo, nextNro, order.store.afipCredential.cuit);

  const response = await wsfeClient.FECAESolicitar({ Auth: { Token: token, Sign: sign, Cuit: order.store.afipCredential.cuit }, FeCAEReq: payload });
  const result = response.FeDetResp.FECAEDetResponse[0];

  if (result.Resultado !== "A") {
    return prisma.invoice.update({
      where: { orderId },
      data: { status: "REJECTED", errorMessage: result.Observaciones?.map((o) => o.Msg).join("; "), afipResponseRaw: response },
    });
  }

  const qrData = buildAfipQrUrl({
    fecha: formatDateISO(new Date()),
    cuit: Number(order.store.afipCredential.cuit),
    ptoVta: order.store.afipPointOfSale,
    tipoCmp: cbteTipo,
    nroCmp: nextNro,
    importe: Number(order.total),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: payload.FeDetReq.FECAEDetRequest.DocTipo,
    nroDocRec: payload.FeDetReq.FECAEDetRequest.DocNro,
    tipoCodAut: "E",
    codAut: Number(result.CAE),
  });

  return prisma.invoice.update({
    where: { orderId },
    data: {
      status: "AUTHORIZED",
      cae: result.CAE,
      caeExpirationDate: parseAfipDate(result.CAEFchVto),
      voucherNumber: nextNro,
      qrData,
      issuedAt: new Date(),
      afipResponseRaw: response,
    },
  });
}
```

## 3. QR fiscal (RG 4892/2020)

AFIP exige un QR que codifica una URL con un JSON en base64:

```ts
// apps/afip-worker/src/wsfe/build-qr.ts
interface AfipQrPayload {
  ver: 1;
  fecha: string;      // YYYY-MM-DD
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string;      // "PES"
  ctz: number;
  tipoDocRec: number;
  nroDocRec: number;
  tipoCodAut: "E";      // E = CAE
  codAut: number;
}

export function buildAfipQrUrl(data: Omit<AfipQrPayload, "ver">): string {
  const payload: AfipQrPayload = { ver: 1, ...data };
  const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}
```

Esta URL es lo que se codifica como imagen QR en el comprobante impreso (ver
`docs/peripherals.md` §2.2).

## 4. Modo no fiscal

`Order` sin requerimiento de factura (o cliente sin CUIT/DNI que no exige
comprobante) genera un `Invoice` con `type = TICKET_NO_FISCAL`, sin llamar a
WSFE — se imprime como "Ticket interno / Remito X", sin CAE ni QR. Esto es
simplemente **no encolar** el job de CAE para esa orden; el resto del flujo
de venta (stock, caja, pagos) es idéntico.

## 5. Manejo de errores y reintentos

AFIP puede estar caído o responder lento. La solicitud de CAE se encola en
BullMQ igual que WooCommerce (mismo patrón, cola separada `afip-cae`), con
la venta ya confirmada y el stock ya descontado — **la disponibilidad de
AFIP nunca bloquea la venta en el mostrador**. Si falla tras agotar
reintentos, la orden queda con `Invoice.status = ERROR` y aparece en un
panel de "comprobantes pendientes" para reintento manual o para emitir en
otro momento (dentro de la ventana que permite AFIP, normalmente 10 días
para la fecha del comprobante).
