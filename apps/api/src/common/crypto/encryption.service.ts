import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96 bits, el tamaño recomendado para GCM
const PREFIX = 'enc';
const VERSION = 'v1';

// Formato de almacenamiento: enc:v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>
//
// Se guarda en la MISMA columna de texto que el valor original, en vez de
// abrir columnas nuevas para iv/tag: así el cifrado es transparente para el
// schema, y la etiqueta `enc:v1:` permite distinguir a simple vista un valor
// cifrado de uno en texto plano — que es lo que hace posible migrar los
// datos existentes sin downtime (ver decryptIfLegacyPlaintext) y rotar a un
// `v2` en el futuro sin romper lo ya guardado.
const STORED_PARTS = 5;

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private cachedKey: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  // La clave se resuelve perezosamente y se cachea: si el sistema nunca toca
  // datos cifrados (p. ej. un tenant sin configuración fiscal), no tiene por
  // qué exigir ENCRYPTION_KEY para arrancar. Pero apenas se necesita, la
  // ausencia o un formato inválido es un error duro — nunca un fallback a
  // texto plano silencioso.
  private getKey(): Buffer {
    if (this.cachedKey) return this.cachedKey;

    const raw = this.config.get<string>('ENCRYPTION_KEY');
    if (!raw) {
      throw new InternalServerErrorException(
        'Falta ENCRYPTION_KEY: no se pueden guardar ni leer credenciales fiscales cifradas. ' +
          'Generar una con: openssl rand -hex 32',
      );
    }

    const key = this.parseKey(raw);
    if (key.length !== KEY_BYTES) {
      throw new InternalServerErrorException(
        `ENCRYPTION_KEY debe representar exactamente ${KEY_BYTES} bytes (256 bits); ` +
          `la configurada tiene ${key.length}. Generar una con: openssl rand -hex 32`,
      );
    }

    this.cachedKey = key;
    return key;
  }

  // Acepta hex (64 caracteres) o base64. El hex se prueba primero porque es
  // lo que produce `openssl rand -hex 32`, que es lo que documentamos.
  private parseKey(raw: string): Buffer {
    const trimmed = raw.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    return Buffer.from(trimmed, 'base64');
  }

  isEncrypted(value: string | null | undefined): boolean {
    if (!value) return false;
    return value.startsWith(`${PREFIX}:${VERSION}:`);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.getKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      PREFIX,
      VERSION,
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  // Lanza si el valor fue manipulado: en GCM el authTag es lo que hace que
  // un ciphertext alterado no se pueda descifrar en silencio devolviendo
  // basura. Es la diferencia entre AES-GCM y, por ejemplo, AES-CBC pelado.
  decrypt(stored: string): string {
    const parts = stored.split(':');
    if (parts.length !== STORED_PARTS || parts[0] !== PREFIX) {
      throw new InternalServerErrorException(
        'El valor cifrado tiene un formato inesperado',
      );
    }
    if (parts[1] !== VERSION) {
      throw new InternalServerErrorException(
        `Versión de cifrado no soportada: ${parts[1]}`,
      );
    }

    const [, , ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv(
      ALGORITHM,
      this.getKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    try {
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // No se filtra el error crudo de OpenSSL: solo interesa que falló la
      // verificación de integridad (clave equivocada o dato manipulado).
      throw new InternalServerErrorException(
        'No se pudo descifrar la credencial: la clave es incorrecta o el dato fue alterado',
      );
    }
  }

  // Puente para los datos que ya estaban guardados en texto plano antes de
  // esta migración. Deja pasar el valor tal cual, pero lo avisa por log para
  // que se vea que falta correr el backfill (ver scripts/encrypt-fiscal-credentials.ts).
  decryptIfLegacyPlaintext(stored: string, hint: string): string {
    if (this.isEncrypted(stored)) return this.decrypt(stored);

    this.logger.warn(
      `Credencial fiscal en TEXTO PLANO (${hint}). Correr el backfill de cifrado: ` +
        'pnpm --filter @pos/api run encrypt-credentials',
    );
    return stored;
  }
}
