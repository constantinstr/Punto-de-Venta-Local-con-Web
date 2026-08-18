import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';

// Compresión compartida por productos y logos de local: todo se normaliza a
// WebP sin importar el formato de entrada — el resultado típico pasa de
// 2-5MB (foto de celular) a 30-80KB.
export interface ImageDimensions {
  maxWidth: number;
  maxHeight: number;
}

export async function compressImage(
  buffer: Buffer,
  { maxWidth, maxHeight }: ImageDimensions,
): Promise<Buffer> {
  try {
    return await sharp(buffer)
      // Aplica la orientación EXIF antes de todo lo demás — sin esto, las
      // fotos sacadas con el celular en vertical se guardan acostadas.
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    // sharp falla al procesar cualquier cosa que no sea una imagen real —
    // es la validación de contenido real, no confiar en el mimetype que
    // declara el cliente.
    throw new BadRequestException(
      'El archivo no es una imagen válida (jpg, png o webp)',
    );
  }
}
