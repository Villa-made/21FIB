import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { inspectEvidence } from "../../supabase/functions/api/media/evidence.ts";
import { sanitizeEvidence } from "../../supabase/functions/api/media/sanitize.ts";
import { Image } from "jsr:@cross/image@0.4.3";

const NOW = new Date("2026-10-10T12:00:00.000Z");

function u16(value: number): number[] {
  return [value >> 8, value & 0xff];
}
function u32(value: number): number[] {
  return [
    value >>> 24,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}
function u32le(value: number): number[] {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    value >>> 24,
  ];
}

/** A structurally valid-enough JPEG with a little-endian EXIF DateTimeOriginal and GPS IFD pointer. */
function jpegWithExif(
  value?: string,
  valid = true,
  offsetTime?: string,
): Uint8Array {
  if (value === undefined) {
    return new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xc0,
      0,
      11,
      8,
      0,
      1,
      0,
      1,
      1,
      1,
      0x11,
      0,
      0xff,
      0xda,
      0,
      8,
      1,
      1,
      0,
      0,
      0x3f,
      0,
      0,
      0xff,
      0xd9,
    ]);
  }
  const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0];
  // IFD0: GPSInfoIFDPointer (metadata that must be stripped) and ExifIFDPointer.
  tiff.push(2, 0);
  tiff.push(0x25, 0x88, 4, 0, 1, 0, 0, 0, 38, 0, 0, 0);
  tiff.push(0x69, 0x87, 4, 0, 1, 0, 0, 0, 44, 0, 0, 0);
  tiff.push(0, 0, 0, 0); // next IFD
  tiff.push(0, 0, 0, 0, 0, 0); // empty GPS IFD
  tiff.push(offsetTime === undefined ? 1 : 2, 0); // Exif IFD count
  const date = value ? [...new TextEncoder().encode(value), 0] : [];
  const dataStart = offsetTime === undefined ? 62 : 74;
  tiff.push(0x03, 0x90, 2, 0, ...u32le(date.length || 1), ...u32le(dataStart));
  const offsetBytes = offsetTime === undefined
    ? []
    : [...new TextEncoder().encode(offsetTime), 0];
  if (offsetTime !== undefined) {
    tiff.push(
      0x11,
      0x90,
      2,
      0,
      ...u32le(offsetBytes.length),
      ...u32le(dataStart + date.length),
    );
  }
  tiff.push(0, 0, 0, 0, ...date, ...offsetBytes);
  const exif = [...new TextEncoder().encode("Exif\0\0"), ...tiff];
  const body = valid ? exif : exif.slice(0, 20);
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    ...u16(body.length + 2),
    ...body,
    0xff,
    0xc0,
    0,
    11,
    8,
    0,
    1,
    0,
    1,
    1,
    1,
    0x11,
    0,
    0xff,
    0xda,
    0,
    8,
    1,
    1,
    0,
    0,
    0x3f,
    0,
    0,
    0xff,
    0xd9,
  ]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function exifTiff(value: string): Uint8Array {
  const withExif = jpegWithExif(value);
  const app1End = 4 + (withExif[4] << 8) + withExif[5];
  return withExif.subarray(12, app1End);
}

function pngChunk(type: string, data: Uint8Array): number[] {
  const typeAndData = new Uint8Array([
    ...new TextEncoder().encode(type),
    ...data,
  ]);
  return [...u32(data.length), ...typeAndData, ...u32(crc32(typeAndData))];
}

async function pngWithMetadata(): Promise<Uint8Array> {
  const clean = await Image.create(1, 1, 255, 0, 0).encode("png");
  return new Uint8Array([
    ...clean.subarray(0, 33),
    ...pngChunk("eXIf", exifTiff("2026:10:10 11:30:00")),
    ...pngChunk("tEXt", new TextEncoder().encode("GPS\0private-location")),
    ...clean.subarray(33),
  ]);
}

async function webpWithMetadata(): Promise<Uint8Array> {
  const clean = await Image.create(1, 1, 255, 0, 0).encode("webp");
  const exif = new Uint8Array([
    ...new TextEncoder().encode("Exif\0\0"),
    ...exifTiff("2026:10:10 11:30:00"),
  ]);
  const length = exif.length;
  const chunk = [
    69,
    88,
    73,
    70,
    length & 0xff,
    (length >>> 8) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 24) & 0xff,
    ...exif,
    ...(length % 2 ? [0] : []),
  ];
  const size = clean.length + chunk.length - 8;
  return new Uint8Array([
    ...clean.subarray(0, 4),
    size & 0xff,
    (size >>> 8) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 24) & 0xff,
    ...clean.subarray(8),
    ...chunk,
  ]);
}

async function validJpegWithExif(): Promise<Uint8Array> {
  const clean = await Image.create(1, 1, 255, 0, 0).encode("jpeg");
  const withExif = jpegWithExif("2026:10:10 11:30:00");
  const app1End = 4 + (withExif[4] << 8) + withExif[5];
  return new Uint8Array([
    0xff,
    0xd8,
    ...withExif.subarray(2, app1End),
    ...clean.subarray(2),
  ]);
}

Deno.test("gallery EXIF captured 59 and exactly 60 minutes ago is accepted", () => {
  for (const minutes of [59, 60]) {
    const timestamp = new Date(NOW.getTime() - minutes * 60_000).toISOString()
      .slice(0, 19).replace(/-/g, ":").replace("T", " ");
    const result = inspectEvidence(jpegWithExif(timestamp), "GALLERY", NOW);
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(
        result.captureExifAt?.toISOString(),
        new Date(NOW.getTime() - minutes * 60_000).toISOString(),
      );
    }
  }
});

Deno.test("gallery EXIF captured 61 minutes ago or in the future is rejected", () => {
  for (const offset of [-61, 1]) {
    const timestamp = new Date(NOW.getTime() + offset * 60_000).toISOString()
      .slice(0, 19).replace(/-/g, ":").replace("T", " ");
    assertEquals(inspectEvidence(jpegWithExif(timestamp), "GALLERY", NOW), {
      ok: false,
      code: "PHOTO_TOO_OLD",
    });
  }
});

Deno.test("EXIF OffsetTimeOriginal is applied before comparing with server UTC", () => {
  const recent = inspectEvidence(
    jpegWithExif("2026:10:10 13:30:00", true, "+02:00"),
    "GALLERY",
    NOW,
  );
  assertEquals(recent.ok, true);
  if (recent.ok) {
    assertEquals(
      recent.captureExifAt?.toISOString(),
      "2026-10-10T11:30:00.000Z",
    );
  }
  assertEquals(
    inspectEvidence(
      jpegWithExif("2026:10:10 13:30:00", true, "+XX:00"),
      "GALLERY",
      NOW,
    ),
    { ok: false, code: "EXIF_REQUIRED" },
  );
});

Deno.test("gallery images missing or containing invalid EXIF capture time require camera flow", () => {
  assertEquals(inspectEvidence(jpegWithExif(), "GALLERY", NOW), {
    ok: false,
    code: "EXIF_REQUIRED",
  });
  assertEquals(
    inspectEvidence(jpegWithExif("not-a-timestamp"), "GALLERY", NOW),
    { ok: false, code: "EXIF_REQUIRED" },
  );
  assertEquals(
    inspectEvidence(jpegWithExif("2026:02:31 12:00:00"), "GALLERY", NOW),
    { ok: false, code: "EXIF_REQUIRED" },
  );
});

Deno.test("gallery PNG and WebP images with valid EXIF capture time are accepted", async () => {
  const png = inspectEvidence(await pngWithMetadata(), "GALLERY", NOW);
  const webp = inspectEvidence(await webpWithMetadata(), "GALLERY", NOW);
  assertEquals(png.ok, true);
  assertEquals(webp.ok, true);
  if (png.ok) {
    assertEquals(png.captureExifAt?.toISOString(), "2026-10-10T11:30:00.000Z");
  }
  if (webp.ok) {
    assertEquals(webp.captureExifAt?.toISOString(), "2026-10-10T11:30:00.000Z");
  }
});

Deno.test("camera flow accepts valid image bytes without EXIF but still rejects unsupported bytes", () => {
  assertEquals(inspectEvidence(jpegWithExif(), "CAMERA_FLOW", NOW), {
    ok: true,
    mime: "image/jpeg",
    captureExifAt: null,
  });
  assertEquals(inspectEvidence(new Uint8Array([1, 2, 3]), "CAMERA_FLOW", NOW), {
    ok: false,
    code: "UNSUPPORTED_MEDIA",
  });
});

Deno.test("sanitization removes JPEG EXIF and GPS metadata before publication", async () => {
  const original = await validJpegWithExif();
  assertEquals(inspectEvidence(original, "GALLERY", NOW).ok, true);
  const sanitized = await sanitizeEvidence(original);
  assertEquals(sanitized.contentType, "image/jpeg");
  assertEquals(sanitized.bytes === original, false);
  assertEquals(sanitized.bytes.length < original.length, true);
  assertEquals(
    new TextDecoder().decode(sanitized.bytes).includes("Exif"),
    false,
  );
  assertEquals(inspectEvidence(sanitized.bytes, "GALLERY", NOW), {
    ok: false,
    code: "EXIF_REQUIRED",
  });
  assertEquals((await Image.decode(sanitized.bytes)).width, 1);
});

Deno.test("sanitization removes PNG metadata chunks", async () => {
  const sanitized = await sanitizeEvidence(await pngWithMetadata());
  assertEquals(sanitized.contentType, "image/png");
  assertEquals(
    new TextDecoder().decode(sanitized.bytes).includes("private-location"),
    false,
  );
  assertEquals(inspectEvidence(sanitized.bytes, "GALLERY", NOW), {
    ok: false,
    code: "EXIF_REQUIRED",
  });
  assertEquals((await Image.decode(sanitized.bytes)).width, 1);
});

Deno.test("sanitization removes WebP EXIF metadata from a fresh encoded copy", async () => {
  const original = await webpWithMetadata();
  const sanitized = await sanitizeEvidence(original);
  assertEquals(sanitized.contentType, "image/webp");
  assertEquals(
    new TextDecoder().decode(sanitized.bytes).includes("Exif"),
    false,
  );
  assertEquals(inspectEvidence(sanitized.bytes, "GALLERY", NOW), {
    ok: false,
    code: "EXIF_REQUIRED",
  });
  assertEquals((await Image.decode(sanitized.bytes)).width, 1);
});

Deno.test("malformed images and sanitizer failures fail closed", async () => {
  assertEquals(
    inspectEvidence(jpegWithExif("2026:10:10 11:30:00", false), "GALLERY", NOW),
    { ok: false, code: "UNSUPPORTED_MEDIA" },
  );
  await assertRejects(
    () => sanitizeEvidence(jpegWithExif("2026:10:10 11:30:00")),
    Error,
    "Unable to sanitize image",
  );
  await assertRejects(
    () => sanitizeEvidence(new Uint8Array([0xff, 0xd8, 0xff])),
    Error,
    "Unable to sanitize image",
  );
  await assertRejects(
    () => sanitizeEvidence(new Uint8Array([1, 2, 3])),
    Error,
    "Unable to sanitize image",
  );
});
