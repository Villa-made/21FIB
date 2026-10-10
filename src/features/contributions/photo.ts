// Utilidades de foto en cliente. Solo dan feedback temprano: la comprobación EXIF que cuenta
// es la del servidor sobre el archivo real (RQ-22/25). El EXIF es manipulable.

export const MAX_GALLERY_AGE_MIN = 60;

/** Lee DateTimeOriginal (o DateTime) de un JPEG. Devuelve null si no hay EXIF legible. */
export async function readExifDate(file: File): Promise<Date | null> {
  if (file.type !== 'image/jpeg') return null;
  const buf = new DataView(await file.slice(0, 128 * 1024).arrayBuffer());
  if (buf.byteLength < 4 || buf.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 <= buf.byteLength) {
    const marker = buf.getUint16(offset);
    const size = buf.getUint16(offset + 2);
    if (marker === 0xffe1 && buf.getUint32(offset + 4) === 0x45786966) {
      return parseTiff(buf, offset + 10);
    }
    if ((marker & 0xff00) !== 0xff00) return null;
    offset += 2 + size;
  }
  return null;
}

function parseTiff(buf: DataView, tiff: number): Date | null {
  if (tiff + 8 > buf.byteLength) return null;
  const little = buf.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => buf.getUint16(o, little);
  const u32 = (o: number) => buf.getUint32(o, little);

  const readAscii = (entry: number): string | null => {
    const count = u32(entry + 4);
    const at = count > 4 ? tiff + u32(entry + 8) : entry + 8;
    if (at + count > buf.byteLength) return null;
    let s = '';
    for (let i = 0; i < count - 1; i++) s += String.fromCharCode(buf.getUint8(at + i));
    return s;
  };

  const findTags = (ifd: number, tags: number[]): Map<number, number> => {
    const found = new Map<number, number>();
    if (ifd + 2 > buf.byteLength) return found;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > buf.byteLength) break;
      const tag = u16(entry);
      if (tags.includes(tag)) found.set(tag, entry);
    }
    return found;
  };

  const ifd0 = tiff + u32(tiff + 4);
  const root = findTags(ifd0, [0x8769, 0x0132]);
  let raw: string | null = null;
  const exifPtr = root.get(0x8769);
  if (exifPtr !== undefined) {
    const sub = findTags(tiff + u32(exifPtr + 8), [0x9003]);
    const dto = sub.get(0x9003);
    if (dto !== undefined) raw = readAscii(dto);
  }
  const dt = root.get(0x0132);
  if (!raw && dt !== undefined) raw = readAscii(dt);
  return raw ? parseExifDate(raw) : null;
}

/** "YYYY:MM:DD HH:MM:SS" sin zona horaria: se interpreta como hora local del dispositivo. */
export function parseExifDate(raw: string): Date | null {
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type GalleryCheck = { ok: true } | { ok: false; reason: 'NO_EXIF' | 'TOO_OLD' | 'FUTURE' };

export function checkGalleryDate(captured: Date | null, now = new Date()): GalleryCheck {
  if (!captured) return { ok: false, reason: 'NO_EXIF' };
  const ageMin = (now.getTime() - captured.getTime()) / 60_000;
  if (ageMin < -2) return { ok: false, reason: 'FUTURE' };
  if (ageMin > MAX_GALLERY_AGE_MIN) return { ok: false, reason: 'TOO_OLD' };
  return { ok: true };
}

/**
 * Reduce fotos de cámara a JPEG ≤ ~2000px para respetar el límite de 5 MB y acelerar la subida.
 * Solo para CAMERA_FLOW: re-codificar elimina el EXIF, que sí es obligatorio en GALLERY.
 */
export async function downscaleCameraPhoto(file: File, maxSide = 2000, quality = 0.85): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 3 * 1024 * 1024 && file.type === 'image/jpeg') return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
