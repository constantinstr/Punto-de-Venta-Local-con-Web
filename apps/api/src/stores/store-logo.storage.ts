import { join } from 'node:path';
import { memoryStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// process.cwd() en runtime es /repo (WORKDIR del Dockerfile) — coincide con
// el volumen montado en docker-compose.prod.yml (api_uploads:/repo/uploads)
// para que el logo sobreviva a un redeploy del contenedor.
export const STORE_LOGOS_DIR = join(process.cwd(), 'uploads', 'stores');
export const STORE_LOGO_MAX_DIMENSION = 600;

// En memoria, no en disco: el archivo se comprime (ver image-processing.ts)
// y recién se escribe una vez confirmado que el local existe — así el
// controller no necesita limpiar un archivo huérfano si la validación falla.
export const storeLogoMulterOptions: MulterOptions = {
  storage: memoryStorage(),
  // Validación liviana acá (mimetype declarado por el cliente); la real es
  // que sharp logre procesarlo — ver image-processing.ts.
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
};
