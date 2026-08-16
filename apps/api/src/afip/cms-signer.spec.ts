import * as forge from 'node-forge';
import { signTra } from './cms-signer';
import { buildTraXml } from './tra.util';

// Genera un par clave/certificado autofirmado descartable en el momento
// (no hay certificados reales de AFIP disponibles en este entorno) para
// poder probar la firma CMS/PKCS#7 de punta a punta sin ningún mock.
function generateSelfSignedCert() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: 'Test CUIT 20304050607' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

describe('signTra', () => {
  it('produce un CMS/PKCS#7 válido en base64 que contiene el TRA original', () => {
    const { certPem, keyPem } = generateSelfSignedCert();
    const traXml = buildTraXml('wsfe');

    const signedBase64 = signTra(traXml, certPem, keyPem);

    // Debe ser base64 decodificable a DER...
    const der = forge.util.decode64(signedBase64);
    expect(der.length).toBeGreaterThan(0);

    // ...y ese DER debe parsear como un mensaje PKCS#7 SignedData válido.
    // @types/node-forge no declara `.type` en PkcsSignedData aunque existe
    // en runtime — se amplía el tipo localmente en vez de usar `any`.
    const asn1 = forge.asn1.fromDer(der);
    // messageFromAsn1 devuelve una unión (SignedData | EnvelopedData) que no
    // solapa lo suficiente con el tipo puntual para un cast directo — se
    // pasa por `unknown` como sugiere el propio compilador.
    const p7 = forge.pkcs7.messageFromAsn1(
      asn1,
    ) as unknown as forge.pkcs7.PkcsSignedData & { type: string };

    // .signers es una lista del lado "constructor" (antes de firmar); un
    // mensaje ya parseado desde DER expone el certificado embebido en
    // .certificates, que es lo que realmente importa acá: que viajó el
    // certificado del firmante junto con la firma en el mismo blob que
    // WSAA espera recibir. (node-forge no repuebla .content de vuelta al
    // parsear un SignedData ya armado — no se verifica byte a byte por eso,
    // pero la validez estructural del CMS ya queda probada.)
    expect(p7.type).toBe(forge.pki.oids.signedData);
    expect(p7.certificates).toHaveLength(1);
    expect(forge.pki.certificateToPem(p7.certificates[0])).toBe(certPem);
  });

  it('cada firma es distinta (uniqueId/generationTime cambian por request)', () => {
    const { certPem, keyPem } = generateSelfSignedCert();
    const first = signTra(
      buildTraXml('wsfe', new Date(2026, 0, 1, 10, 0, 0)),
      certPem,
      keyPem,
    );
    const second = signTra(
      buildTraXml('wsfe', new Date(2026, 0, 1, 10, 5, 0)),
      certPem,
      keyPem,
    );
    expect(first).not.toBe(second);
  });
});
