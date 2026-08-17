import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

// Clave de prueba fija (32 bytes en hex). No es un secreto real: sirve para
// que los tests sean deterministas.
const TEST_KEY_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const OTHER_KEY_HEX =
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

function serviceWithKey(key: string | undefined): EncryptionService {
  const config = {
    get: (name: string) => (name === 'ENCRYPTION_KEY' ? key : undefined),
  } as unknown as ConfigService;
  return new EncryptionService(config);
}

const PRIVATE_KEY_SAMPLE =
  '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq…\n-----END PRIVATE KEY-----\n';

describe('EncryptionService', () => {
  describe('ida y vuelta', () => {
    it('descifra a exactamente el mismo texto original', () => {
      const svc = serviceWithKey(TEST_KEY_HEX);
      const stored = svc.encrypt(PRIVATE_KEY_SAMPLE);
      expect(svc.decrypt(stored)).toBe(PRIVATE_KEY_SAMPLE);
    });

    it('el valor guardado no contiene el texto plano', () => {
      const svc = serviceWithKey(TEST_KEY_HEX);
      const stored = svc.encrypt(PRIVATE_KEY_SAMPLE);
      expect(stored).not.toContain('BEGIN PRIVATE KEY');
      expect(stored.startsWith('enc:v1:')).toBe(true);
    });

    it('cifra distinto cada vez (IV aleatorio) pero descifra igual', () => {
      const svc = serviceWithKey(TEST_KEY_HEX);
      const a = svc.encrypt(PRIVATE_KEY_SAMPLE);
      const b = svc.encrypt(PRIVATE_KEY_SAMPLE);
      // Dos cifrados del mismo texto NO pueden ser idénticos: si lo fueran,
      // se filtraría que dos tenants cargaron la misma credencial.
      expect(a).not.toBe(b);
      expect(svc.decrypt(a)).toBe(svc.decrypt(b));
    });

    it('soporta clave en base64 además de hex', () => {
      const b64 = Buffer.from(TEST_KEY_HEX, 'hex').toString('base64');
      const svc = serviceWithKey(b64);
      expect(svc.decrypt(svc.encrypt('hola'))).toBe('hola');
    });
  });

  describe('integridad (authTag de GCM)', () => {
    it('rechaza un ciphertext alterado en vez de devolver basura', () => {
      const svc = serviceWithKey(TEST_KEY_HEX);
      const parts = svc.encrypt(PRIVATE_KEY_SAMPLE).split(':');
      const data = Buffer.from(parts[4], 'base64');
      data[0] ^= 0xff; // se voltea un byte del dato cifrado
      parts[4] = data.toString('base64');

      expect(() => svc.decrypt(parts.join(':'))).toThrow(/alterado|incorrecta/);
    });

    it('rechaza un authTag alterado', () => {
      const svc = serviceWithKey(TEST_KEY_HEX);
      const parts = svc.encrypt(PRIVATE_KEY_SAMPLE).split(':');
      const tag = Buffer.from(parts[3], 'base64');
      tag[0] ^= 0xff;
      parts[3] = tag.toString('base64');

      expect(() => svc.decrypt(parts.join(':'))).toThrow(/alterado|incorrecta/);
    });

    it('rechaza un IV alterado', () => {
      const svc = serviceWithKey(TEST_KEY_HEX);
      const parts = svc.encrypt(PRIVATE_KEY_SAMPLE).split(':');
      const iv = Buffer.from(parts[2], 'base64');
      iv[0] ^= 0xff;
      parts[2] = iv.toString('base64');

      expect(() => svc.decrypt(parts.join(':'))).toThrow(/alterado|incorrecta/);
    });

    it('no descifra con una clave distinta', () => {
      const stored = serviceWithKey(TEST_KEY_HEX).encrypt(PRIVATE_KEY_SAMPLE);
      expect(() => serviceWithKey(OTHER_KEY_HEX).decrypt(stored)).toThrow(
        /alterado|incorrecta/,
      );
    });
  });

  describe('validación de la clave maestra', () => {
    it('falla con un mensaje accionable si falta ENCRYPTION_KEY', () => {
      expect(() => serviceWithKey(undefined).encrypt('x')).toThrow(
        /ENCRYPTION_KEY/,
      );
    });

    it('rechaza una clave que no sean 32 bytes', () => {
      expect(() => serviceWithKey('abcd').encrypt('x')).toThrow(/32 bytes/);
    });
  });

  describe('formato almacenado', () => {
    it('reconoce valores cifrados y no confunde texto plano', () => {
      const svc = serviceWithKey(TEST_KEY_HEX);
      expect(svc.isEncrypted(svc.encrypt('x'))).toBe(true);
      expect(svc.isEncrypted(PRIVATE_KEY_SAMPLE)).toBe(false);
      expect(svc.isEncrypted('')).toBe(false);
      expect(svc.isEncrypted(null)).toBe(false);
    });

    it('rechaza una versión de cifrado desconocida', () => {
      const svc = serviceWithKey(TEST_KEY_HEX);
      const stored = svc.encrypt('x').replace('enc:v1:', 'enc:v9:');
      expect(() => svc.decrypt(stored)).toThrow(/no soportada/);
    });
  });

  describe('compatibilidad con datos previos a la migración', () => {
    it('deja pasar el texto plano tal cual', () => {
      const svc = serviceWithKey(TEST_KEY_HEX);
      expect(svc.decryptIfLegacyPlaintext(PRIVATE_KEY_SAMPLE, 'store=x')).toBe(
        PRIVATE_KEY_SAMPLE,
      );
    });

    it('descifra normalmente si ya está cifrado', () => {
      const svc = serviceWithKey(TEST_KEY_HEX);
      const stored = svc.encrypt(PRIVATE_KEY_SAMPLE);
      expect(svc.decryptIfLegacyPlaintext(stored, 'store=x')).toBe(
        PRIVATE_KEY_SAMPLE,
      );
    });
  });
});
