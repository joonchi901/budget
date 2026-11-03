const SIDE = 512;

/**
 * Redraws a chosen photo at most 512px wide or tall, as WebP (PNG where the browser cannot
 * write WebP). Drawing drops EXIF, so location and camera data never leave the device.
 */
export async function reencodePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await encode('image/webp', 0.85);
  const blob = webp?.type === 'image/webp' ? webp : await encode('image/png');
  if (!blob) throw new Error('사진을 바꾸지 못했어요.');
  return blob;
}
