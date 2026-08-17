import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// process.cwd() en runtime es /repo (WORKDIR del Dockerfile) — coincide con
// el volumen montado en docker-compose.prod.yml (api_uploads:/repo/uploads)
// para que las imágenes sobrevivan a un redeploy del contenedor.
export const PRODUCT_IMAGES_DIR = join(process.cwd(), 'uploads', 'products');

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const productImageMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      mkdirSync(PRODUCT_IMAGES_DIR, { recursive: true });
      cb(null, PRODUCT_IMAGES_DIR);
    },
    // Nombre generado, nunca el original del cliente — evita path traversal
    // y colisiones entre tenants.
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${EXTENSION_BY_MIME[file.mimetype]}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype in EXTENSION_BY_MIME);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
};
