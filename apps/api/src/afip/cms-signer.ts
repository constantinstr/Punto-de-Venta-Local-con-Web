import * as forge from 'node-forge';

// Firma el TRA en CMS/PKCS#7 (equivalente a `openssl smime -sign`) con el
// certificado y clave privada del tenant, tal como exige el WSAA. Se usa
// node-forge (JS puro) en vez de invocar el binario de OpenSSL para no
// depender de que esté instalado en el sistema donde corra la API.
export function signTra(
  traXml: string,
  certPem: string,
  keyPem: string,
): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const privateKey = forge.pki.privateKeyFromPem(keyPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      // Sin `value`: forge completa la hora de firma actual automáticamente
      // (el tipo de @types/node-forge no acepta Date, solo string).
      { type: forge.pki.oids.signingTime },
    ],
  });
  p7.sign();

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}
