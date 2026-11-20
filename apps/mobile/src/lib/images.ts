import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Pasa una imagen del teléfono a JPG (también las HEIC del iPhone), achicada a
 * `maxWidth` si se indica. Devuelve la ruta del archivo nuevo. Si falla, el error
 * dice que fue al preparar la imagen (no al subirla).
 */
export async function toJpeg(uri: string, maxWidth: number | null, compress = 0.86): Promise<string> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    if (maxWidth) ctx.resize({ width: maxWidth });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress, format: SaveFormat.JPEG });
    return out.uri;
  } catch (e) {
    throw new Error(`No se pudo preparar la imagen (${(e as Error).message || 'formato no compatible'}).`);
  }
}
