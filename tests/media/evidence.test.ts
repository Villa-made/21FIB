import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { inspectEvidence } from '../../supabase/functions/api/media/evidence.ts';
import { sanitizeEvidence } from '../../supabase/functions/api/media/sanitize.ts';

const NOW = new Date('2026-10-10T12:00:00.000Z');

function u16(value: number): number[] { return [value >> 8, value & 0xff]; }
function u32(value: number): number[] { return [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]; }

/** A structurally valid-enough JPEG with a little-endian EXIF DateTimeOriginal and GPS IFD pointer. */
function jpegWithExif(value?: string, valid = true): Uint8Array {
  const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0];
  // IFD0: GPSInfoIFDPointer (metadata that must be stripped) and ExifIFDPointer.
  tiff.push(2, 0, 0, 0);
  tiff.push(0x25, 0x88, 4, 0, 1, 0, 0, 0, 38, 0, 0, 0);
  tiff.push(0x69, 0x87, 4, 0, 1, 0, 0, 0, 44, 0, 0, 0);
  tiff.push(0, 0, 0, 0); // next IFD
  tiff.push(0, 0, 0, 0, 0, 0); // empty GPS IFD
  tiff.push(1, 0, 0, 0); // Exif IFD count
  const date = value ? [...new TextEncoder().encode(value), 0] : [];
  tiff.push(0x03, 0x90, 2, 0, ...[date.length || 1, 0, 0, 0], 62, 0, 0, 0);
  tiff.push(0, 0, 0, 0, ...date);
  const exif = [...new TextEncoder().encode('Exif\0\0'), ...tiff];
  const body = valid ? exif : exif.slice(0, 20);
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, ...u16(body.length + 2), ...body,
    0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0, 0xff, 0xd9,
  ]);
}

function pngWithMetadata(): Uint8Array {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const chunk = (type: string, bytes: number[]) => [...u32(bytes.length), ...new TextEncoder().encode(type), ...bytes, 0, 0, 0, 0];
  return new Uint8Array([...signature, ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]), ...chunk('eXIf', [1, 2]), ...chunk('IDAT', []), ...chunk('IEND', [])]);
}

Deno.test('gallery EXIF captured 59 and exactly 60 minutes ago is accepted', () => {
  for (const minutes of [59, 60]) {
    const timestamp = new Date(NOW.getTime() - minutes * 60_000).toISOString().slice(0, 19).replace(/-/g, ':').replace('T', ' ');
    const result = inspectEvidence(jpegWithExif(timestamp), 'GALLERY', NOW);
    assertEquals(result.ok, true);
    if (result.ok) assertEquals(result.captureExifAt?.toISOString(), new Date(NOW.getTime() - minutes * 60_000).toISOString());
  }
});

Deno.test('gallery EXIF captured 61 minutes ago or in the future is rejected', () => {
  for (const offset of [-61, 1]) {
    const timestamp = new Date(NOW.getTime() + offset * 60_000).toISOString().slice(0, 19).replace(/-/g, ':').replace('T', ' ');
    assertEquals(inspectEvidence(jpegWithExif(timestamp), 'GALLERY', NOW), { ok: false, code: 'PHOTO_TOO_OLD' });
  }
});

Deno.test('gallery images missing or containing invalid EXIF capture time require camera flow', () => {
  assertEquals(inspectEvidence(jpegWithExif(), 'GALLERY', NOW), { ok: false, code: 'EXIF_REQUIRED' });
  assertEquals(inspectEvidence(jpegWithExif('not-a-timestamp'), 'GALLERY', NOW), { ok: false, code: 'EXIF_REQUIRED' });
  assertEquals(inspectEvidence(jpegWithExif('2026:02:31 12:00:00'), 'GALLERY', NOW), { ok: false, code: 'EXIF_REQUIRED' });
});

Deno.test('camera flow accepts valid image bytes without EXIF but still rejects unsupported bytes', () => {
  assertEquals(inspectEvidence(jpegWithExif(), 'CAMERA_FLOW', NOW), { ok: true, mime: 'image/jpeg', captureExifAt: null });
  assertEquals(inspectEvidence(new Uint8Array([1, 2, 3]), 'CAMERA_FLOW', NOW), { ok: false, code: 'UNSUPPORTED_MEDIA' });
});

Deno.test('sanitization removes JPEG EXIF and GPS metadata before publication', async () => {
  const original = jpegWithExif('2026:10:10 11:30:00');
  const sanitized = await sanitizeEvidence(original);
  assertEquals(sanitized.contentType, 'image/jpeg');
  assertEquals(sanitized.bytes === original, false);
  assertEquals(sanitized.bytes.length < original.length, true);
  assertEquals(new TextDecoder().decode(sanitized.bytes).includes('Exif'), false);
  assertEquals(inspectEvidence(sanitized.bytes, 'GALLERY', NOW), { ok: false, code: 'EXIF_REQUIRED' });
});

Deno.test('sanitization removes PNG metadata chunks', async () => {
  const sanitized = await sanitizeEvidence(pngWithMetadata());
  assertEquals(sanitized.contentType, 'image/png');
  assertEquals(new TextDecoder().decode(sanitized.bytes).includes('eXIf'), false);
});

Deno.test('malformed images and sanitizer failures fail closed', async () => {
  assertEquals(inspectEvidence(jpegWithExif('2026:10:10 11:30:00', false), 'GALLERY', NOW), { ok: false, code: 'UNSUPPORTED_MEDIA' });
  await assertRejects(() => sanitizeEvidence(new Uint8Array([0xff, 0xd8, 0xff])), Error, 'Unable to sanitize image');
  await assertRejects(() => sanitizeEvidence(new Uint8Array([1, 2, 3])), Error, 'Unable to sanitize image');
});
