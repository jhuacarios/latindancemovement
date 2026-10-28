/**
 * Compresión de imágenes en el navegador antes de subirlas (capturas de
 * pantalla, fotos del celular). Reduce a `maxEdge` px por lado y re-codifica a
 * JPEG; un PNG chico y pequeño se deja tal cual (los textos de una captura se
 * ven mejor sin compresión con pérdida).
 */
export interface CompressedImage {
  file: File;
  width: number;
  height: number;
}

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.88;
/** PNG hasta este tamaño y dentro de MAX_EDGE se conserva sin recodificar. */
const KEEP_PNG_BYTES = 1 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = url;
  });
}

export async function compressImage(
  file: File,
  maxEdge = MAX_EDGE,
): Promise<CompressedImage> {
  const img = await loadImage(file);
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const fits = scale === 1;

  if (fits && file.type === 'image/png' && file.size <= KEEP_PNG_BYTES) {
    return { file, width: w, height: h };
  }
  if (fits && file.type === 'image/jpeg' && file.size <= KEEP_PNG_BYTES) {
    return { file, width: w, height: h };
  }

  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no soporta procesar imágenes.');
  // Fondo blanco: los PNG con transparencia no se vuelven negros en JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('No se pudo comprimir la imagen.');
  const name = file.name.replace(/\.[^.]+$/, '') || 'imagen';
  return {
    file: new File([blob], `${name}.jpg`, { type: 'image/jpeg' }),
    width: cw,
    height: ch,
  };
}
