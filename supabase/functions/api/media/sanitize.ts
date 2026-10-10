// T09 sanitization.  The private original is never returned: only a parsed copy
// with metadata-bearing chunks/segments omitted can be sent to published-private.
import type { EvidenceSanitizer } from "../domain/ports.ts";
import { Image } from "jsr:@cross/image@0.4.3";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  if (start < 0 || start + length > bytes.length) {
    throw new Error("out of bounds");
  }
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
function u16(bytes: Uint8Array, at: number): number {
  if (at + 2 > bytes.length) throw new Error("out of bounds");
  return (bytes[at] << 8) | bytes[at + 1];
}
function u32be(bytes: Uint8Array, at: number): number {
  if (at + 4 > bytes.length) throw new Error("out of bounds");
  return ((bytes[at] * 0x1000000) + (bytes[at + 1] << 16) +
    (bytes[at + 2] << 8) + bytes[at + 3]) >>> 0;
}
function u32le(bytes: Uint8Array, at: number): number {
  if (at + 4 > bytes.length) throw new Error("out of bounds");
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) |
    (bytes[at + 3] * 0x1000000)) >>> 0;
}
function isPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return bytes.length >= prefix.length &&
    prefix.every((n, i) => bytes[i] === n);
}

function jpeg(bytes: Uint8Array): Uint8Array {
  if (!isPrefix(bytes, [0xff, 0xd8])) throw new Error("not JPEG");
  const output: number[] = [0xff, 0xd8];
  let offset = 2;
  let hasFrame = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error("invalid JPEG");
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!hasFrame) throw new Error("invalid JPEG");
      output.push(0xff, 0xd9);
      return new Uint8Array(output);
    }
    if (marker === 0xda) {
      if (!hasFrame || offset + 2 > bytes.length) {
        throw new Error("invalid JPEG");
      }
      const length = u16(bytes, offset);
      if (
        length < 2 || offset + length > bytes.length ||
        bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9
      ) throw new Error("invalid JPEG");
      output.push(0xff, marker, ...bytes.subarray(offset, bytes.length));
      return new Uint8Array(output);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      output.push(0xff, marker);
      continue;
    }
    const length = u16(bytes, offset);
    if (length < 2 || offset + length > bytes.length) {
      throw new Error("invalid JPEG");
    }
    // APPn and COM are metadata/application segments. Dropping all of them removes
    // EXIF, GPS, XMP, comments and camera-maker data rather than relying on tag lists.
    if (!((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe)) {
      output.push(0xff, marker, ...bytes.subarray(offset, offset + length));
    }
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)
    ) hasFrame = true;
    offset += length;
  }
  throw new Error("invalid JPEG");
}

function png(bytes: Uint8Array): Uint8Array {
  if (!isPrefix(bytes, PNG_SIGNATURE)) throw new Error("not PNG");
  const output: number[] = Array.from(PNG_SIGNATURE);
  let offset = 8, hasHeader = false, hasData = false;
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset),
      type = ascii(bytes, offset + 4, 4),
      end = offset + 12 + length;
    if (end > bytes.length) throw new Error("invalid PNG");
    if (type === "IHDR") hasHeader = length === 13;
    if (type === "IDAT") hasData = true;
    // Keep critical chunks only. All ancillary chunks, including eXIf/iTXt/tEXt/zTXt,
    // are omitted so no location or identifying metadata can be published.
    if ((bytes[offset + 4] & 0x20) === 0) {
      output.push(...bytes.subarray(offset, end));
    }
    if (type === "IEND") {
      if (!hasHeader || !hasData || end !== bytes.length) {
        throw new Error("invalid PNG");
      }
      return new Uint8Array(output);
    }
    offset = end;
  }
  throw new Error("invalid PNG");
}

function webp(bytes: Uint8Array): Uint8Array {
  if (
    bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP" || u32le(bytes, 4) + 8 !== bytes.length
  ) throw new Error("not WebP");
  const chunks: number[] = [];
  let offset = 12, hasImage = false;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4),
      length = u32le(bytes, offset + 4),
      end = offset + 8 + length + (length % 2);
    if (end > bytes.length) throw new Error("invalid WebP");
    if (type === "VP8 " || type === "VP8L" || type === "VP8X") hasImage = true;
    // EXIF and XMP are the WebP metadata containers; all other non-render chunks are
    // also discarded. Rendering chunks stay byte-for-byte unchanged.
    if (["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF"].includes(type)) {
      chunks.push(...bytes.subarray(offset, end));
    }
    offset = end;
  }
  if (!hasImage || offset !== bytes.length) throw new Error("invalid WebP");
  const size = 4 + chunks.length;
  return new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    size & 0xff,
    (size >>> 8) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 24) & 0xff,
    0x57,
    0x45,
    0x42,
    0x50,
    ...chunks,
  ]);
}

/** Throws on any decoding/format failure; callers must treat that as non-publishable. */
export async function sanitizeEvidence(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  try {
    const format = isPrefix(bytes, [0xff, 0xd8])
      ? "jpeg"
      : isPrefix(bytes, PNG_SIGNATURE)
      ? "png"
      : bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" &&
          ascii(bytes, 8, 4) === "WEBP"
      ? "webp"
      : null;
    if (format === null) throw new Error("unsupported format");
    // A full pixel decode rejects files with plausible headers but broken image data.
    // Fresh encoding also prevents encoded pixel streams from being copied verbatim.
    // Source: https://jsr.io/@cross/image (Image.decode, encode and setMetadata).
    const image = await Image.decode(bytes, {
      tolerantDecoding: false,
      runtimeDecoding: "never",
    });
    if (
      image.width < 1 || image.height < 1 ||
      image.width * image.height > 20_000_000
    ) throw new Error("unsafe dimensions");
    image.setMetadata({}, false);
    const encoded = await image.encode(format);
    if (format === "jpeg") {
      return { bytes: jpeg(encoded), contentType: "image/jpeg" };
    }
    if (format === "png") {
      return { bytes: png(encoded), contentType: "image/png" };
    }
    return { bytes: webp(encoded), contentType: "image/webp" };
  } catch {
    // Preserve neither parser details nor raw bytes in errors/logs.
  }
  throw new Error("Unable to sanitize image");
}

/** Adapter consumed by the validation workflow; failures deliberately reject. */
export const evidenceSanitizer: EvidenceSanitizer = {
  sanitize: sanitizeEvidence,
};
