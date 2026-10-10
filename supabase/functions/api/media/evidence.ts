// Media boundary for T09.  It reads bytes from private storage; no client supplied
// MIME type or timestamp is trusted.  EXIF timestamps have no timezone, so they are
// deliberately compared as UTC wall-clock values against the supplied server clock.
import type { CaptureOrigin } from '../domain/contracts.ts';
import type { EvidenceInspection, EvidenceInspector } from '../domain/ports.ts';

const JPEG_SOI = [0xff, 0xd8] as const;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const RIFF = 'RIFF';
const WEBP = 'WEBP';
const EXIF_MAX_AGE_MS = 60 * 60 * 1000;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  if (start < 0 || start + length > bytes.length) throw new Error('out of bounds');
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function u16(bytes: Uint8Array, at: number, little: boolean): number {
  if (at + 2 > bytes.length) throw new Error('out of bounds');
  return little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1];
}

function u32(bytes: Uint8Array, at: number, little: boolean): number {
  if (at + 4 > bytes.length) throw new Error('out of bounds');
  return little
    ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] * 0x1000000)) >>> 0
    : ((bytes[at] * 0x1000000) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3]) >>> 0;
}

function isPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((value, index) => bytes[index] === value);
}

function parseExifDate(bytes: Uint8Array): Date | null {
  // APP1 payload begins Exif\0\0 followed by a TIFF header.
  if (ascii(bytes, 0, 6) !== 'Exif\0\0') return null;
  const base = 6;
  const order = ascii(bytes, base, 2);
  if (order !== 'II' && order !== 'MM') throw new Error('invalid TIFF byte order');
  const little = order === 'II';
  if (u16(bytes, base + 2, little) !== 42) throw new Error('invalid TIFF marker');
  const ifd0 = base + u32(bytes, base + 4, little);
  const exifIfd = offsetForTag(bytes, base, ifd0, little, 0x8769);
  const original = exifIfd === null ? null : valueForTag(bytes, base, base + exifIfd, little, 0x9003);
  const fallback = valueForTag(bytes, base, ifd0, little, 0x0132);
  const raw = original ?? fallback;
  return raw === null ? null : toUtcExifDate(raw);
}

function offsetForTag(bytes: Uint8Array, base: number, ifd: number, little: boolean, wanted: number): number | null {
  const count = u16(bytes, ifd, little);
  if (count > 256 || ifd + 2 + count * 12 + 4 > bytes.length) throw new Error('invalid TIFF IFD');
  for (let index = 0; index < count; index++) {
    const at = ifd + 2 + index * 12;
    if (u16(bytes, at, little) !== wanted) continue;
    if (u16(bytes, at + 2, little) !== 4 || u32(bytes, at + 4, little) !== 1) throw new Error('invalid TIFF offset');
    const offset = u32(bytes, at + 8, little);
    if (base + offset >= bytes.length) throw new Error('invalid TIFF offset');
    return offset;
  }
  return null;
}

function valueForTag(bytes: Uint8Array, base: number, ifd: number, little: boolean, wanted: number): string | null {
  const count = u16(bytes, ifd, little);
  if (count > 256 || ifd + 2 + count * 12 + 4 > bytes.length) throw new Error('invalid TIFF IFD');
  for (let index = 0; index < count; index++) {
    const at = ifd + 2 + index * 12;
    if (u16(bytes, at, little) !== wanted) continue;
    if (u16(bytes, at + 2, little) !== 2) throw new Error('invalid EXIF timestamp type');
    const length = u32(bytes, at + 4, little);
    if (length < 2 || length > 32) throw new Error('invalid EXIF timestamp length');
    const offset = u32(bytes, at + 8, little);
    const start = length <= 4 ? at + 8 : base + offset;
    if (start + length > bytes.length) throw new Error('invalid EXIF timestamp offset');
    return ascii(bytes, start, length).replace(/\0+$/, '');
  }
  return null;
}

function toUtcExifDate(value: string): Date | null {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day &&
      date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second
    ? date
    : null;
}

function inspectJpeg(bytes: Uint8Array): Date | null {
  if (!isPrefix(bytes, JPEG_SOI) || bytes.length < 4) throw new Error('not JPEG');
  let offset = 2;
  let exif: Date | null = null;
  let hasFrame = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error('invalid JPEG marker');
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!hasFrame) throw new Error('JPEG has no frame');
      return exif;
    }
    if (marker === 0xda) {
      if (!hasFrame || offset + 2 > bytes.length) throw new Error('JPEG has no image data');
      const length = u16(bytes, offset, false);
      if (length < 2 || offset + length > bytes.length || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw new Error('invalid JPEG scan');
      return exif;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw new Error('truncated JPEG segment');
    const length = u16(bytes, offset, false);
    if (length < 2 || offset + length > bytes.length) throw new Error('invalid JPEG segment');
    const payload = bytes.subarray(offset + 2, offset + length);
    if (marker === 0xe1 && exif === null && payload.length >= 6 && ascii(payload, 0, 6) === 'Exif\0\0') exif = parseExifDate(payload);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) hasFrame = true;
    offset += length;
  }
  throw new Error('JPEG missing end marker');
}

function inspectPng(bytes: Uint8Array): void {
  if (!isPrefix(bytes, PNG_SIGNATURE)) throw new Error('not PNG');
  let offset = 8;
  let hasHeader = false;
  let hasData = false;
  while (offset + 12 <= bytes.length) {
    const length = u32(bytes, offset, false);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('invalid PNG chunk');
    if (type === 'IHDR') hasHeader = length === 13;
    if (type === 'IDAT') hasData = true;
    if (type === 'IEND') {
      if (!hasHeader || !hasData || end !== bytes.length) throw new Error('invalid PNG end');
      return;
    }
    offset = end;
  }
  throw new Error('PNG missing end');
}

function inspectWebp(bytes: Uint8Array): void {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== RIFF || ascii(bytes, 8, 4) !== WEBP) throw new Error('not WebP');
  const declared = u32(bytes, 4, true) + 8;
  if (declared !== bytes.length) throw new Error('invalid WebP size');
  let offset = 12;
  let hasImage = false;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = u32(bytes, offset + 4, true);
    const end = offset + 8 + length + (length % 2);
    if (end > bytes.length) throw new Error('invalid WebP chunk');
    if (type === 'VP8 ' || type === 'VP8L' || type === 'VP8X') hasImage = true;
    offset = end;
  }
  if (offset !== bytes.length || !hasImage) throw new Error('invalid WebP');
}

/** Inspects real image bytes and enforces gallery timestamp policy against server time. */
export function inspectEvidence(bytes: Uint8Array, origin: CaptureOrigin, serverNow: Date): EvidenceInspection {
  try {
    let mime: string;
    let captureExifAt: Date | null = null;
    if (isPrefix(bytes, JPEG_SOI)) {
      mime = 'image/jpeg';
      captureExifAt = inspectJpeg(bytes);
    } else if (isPrefix(bytes, PNG_SIGNATURE)) {
      mime = 'image/png';
      inspectPng(bytes);
    } else if (bytes.length >= 12 && ascii(bytes, 0, 4) === RIFF && ascii(bytes, 8, 4) === WEBP) {
      mime = 'image/webp';
      inspectWebp(bytes);
    } else return { ok: false, code: 'UNSUPPORTED_MEDIA' };

    if (origin === 'GALLERY') {
      if (captureExifAt === null) return { ok: false, code: 'EXIF_REQUIRED' };
      const age = serverNow.getTime() - captureExifAt.getTime();
      if (age < 0 || age > EXIF_MAX_AGE_MS) return { ok: false, code: 'PHOTO_TOO_OLD' };
    }
    return { ok: true, mime, captureExifAt };
  } catch {
    return { ok: false, code: 'UNSUPPORTED_MEDIA' };
  }
}

/** Adapter used by Group A through the existing domain port. */
export const evidenceInspector: EvidenceInspector = { inspect: inspectEvidence };
