// Pure binary asset verification: SHA-256 content addressing, magic-byte MIME sniffing, and PNG/JPEG/WebP header dimensions.
import { createHash } from "node:crypto";

/** Maximum size of one uploaded binary asset: 5 MiB. */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
/** Maximum allowed image width or height in pixels. */
export const MAX_ASSET_DIMENSION_PX = 4096;

export const ALLOWED_ASSET_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type AllowedAssetMime = (typeof ALLOWED_ASSET_MIMES)[number];

const ASSET_ID_RE = /^[0-9a-f]{64}$/;

export function isAssetId(value: string): boolean {
  return ASSET_ID_RE.test(value);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type HeaderSniffResult =
  | {
      readonly ok: true;
      readonly mime: AllowedAssetMime;
      readonly width: number;
      readonly height: number;
    }
  | { readonly ok: false; readonly reason: "unsupported" | "invalid" };

function u16be(b: Uint8Array, offset: number): number {
  return ((b[offset]! << 8) | b[offset + 1]!) >>> 0;
}

function u32be(b: Uint8Array, offset: number): number {
  return (
    ((b[offset]! << 24) |
      (b[offset + 1]! << 16) |
      (b[offset + 2]! << 8) |
      b[offset + 3]!) >>>
    0
  );
}

function isPngMagic(b: Uint8Array): boolean {
  return (
    b.byteLength >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}

function parsePng(b: Uint8Array): HeaderSniffResult {
  if (
    b.byteLength < 24 ||
    u32be(b, 8) !== 13 ||
    b[12] !== 0x49 ||
    b[13] !== 0x48 ||
    b[14] !== 0x44 ||
    b[15] !== 0x52
  )
    return { ok: false, reason: "invalid" };
  return {
    ok: true,
    mime: "image/png",
    width: u32be(b, 16),
    height: u32be(b, 20),
  };
}

function isJpegMagic(b: Uint8Array): boolean {
  return b.byteLength >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

const JPEG_SOF_MARKERS: ReadonlySet<number> = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function parseJpeg(b: Uint8Array): HeaderSniffResult {
  let offset = 2;
  while (offset < b.byteLength) {
    if (b[offset] !== 0xff) return { ok: false, reason: "invalid" };
    while (offset < b.byteLength && b[offset] === 0xff) offset += 1;
    if (offset >= b.byteLength) break;
    const marker = b[offset]!;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > b.byteLength) return { ok: false, reason: "invalid" };
    const segmentLen = u16be(b, offset);
    if (segmentLen < 2 || offset + segmentLen > b.byteLength)
      return { ok: false, reason: "invalid" };
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLen < 7) return { ok: false, reason: "invalid" };
      const height = u16be(b, offset + 3);
      const width = u16be(b, offset + 5);
      return { ok: true, mime: "image/jpeg", width, height };
    }
    offset += segmentLen;
  }
  return { ok: false, reason: "invalid" };
}

function isWebpMagic(b: Uint8Array): boolean {
  return (
    b.byteLength >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  );
}

function parseWebp(b: Uint8Array): HeaderSniffResult {
  if (b.byteLength < 16) return { ok: false, reason: "invalid" };
  const c0 = b[12]!;
  const c1 = b[13]!;
  const c2 = b[14]!;
  const c3 = b[15]!;
  if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x20) {
    // VP8 lossy
    if (b.byteLength < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a)
      return { ok: false, reason: "invalid" };
    const width = (b[26]! | (b[27]! << 8)) & 0x3fff;
    const height = (b[28]! | (b[29]! << 8)) & 0x3fff;
    return { ok: true, mime: "image/webp", width, height };
  }
  if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x4c) {
    // VP8L lossless
    if (b.byteLength < 25 || b[20] !== 0x2f)
      return { ok: false, reason: "invalid" };
    const bits =
      (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0;
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return { ok: true, mime: "image/webp", width, height };
  }
  if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x58) {
    // VP8X extended
    if (b.byteLength < 30) return { ok: false, reason: "invalid" };
    const width = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
    const height = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    return { ok: true, mime: "image/webp", width, height };
  }
  return { ok: false, reason: "invalid" };
}

/** Sniffs magic bytes and extracts exact pixel dimensions without decoding pixel data. */
export function sniffImageHeader(bytes: Uint8Array): HeaderSniffResult {
  if (isPngMagic(bytes)) return parsePng(bytes);
  if (isJpegMagic(bytes)) return parseJpeg(bytes);
  if (isWebpMagic(bytes)) return parseWebp(bytes);
  return { ok: false, reason: "unsupported" };
}

export type VerifyAssetRefusal =
  "bad_request" | "too_large" | "unsupported_kind" | "invalid";

export type VerifyAssetResult =
  | {
      readonly ok: true;
      readonly mime: AllowedAssetMime;
      readonly width: number;
      readonly height: number;
      readonly byteLength: number;
    }
  | { readonly ok: false; readonly code: VerifyAssetRefusal };

/** Full verification of an uploaded binary asset against its expected SHA-256 assetId. */
export function verifyAssetBytes(
  expectedAssetId: string,
  bytes: Uint8Array,
): VerifyAssetResult {
  if (!isAssetId(expectedAssetId) || bytes.byteLength === 0)
    return { ok: false, code: "bad_request" };
  if (bytes.byteLength > MAX_ASSET_BYTES)
    return { ok: false, code: "too_large" };
  if (sha256Hex(bytes) !== expectedAssetId)
    return { ok: false, code: "bad_request" };
  const sniffed = sniffImageHeader(bytes);
  if (!sniffed.ok)
    return {
      ok: false,
      code: sniffed.reason === "unsupported" ? "unsupported_kind" : "invalid",
    };
  if (
    sniffed.width < 1 ||
    sniffed.height < 1 ||
    sniffed.width > MAX_ASSET_DIMENSION_PX ||
    sniffed.height > MAX_ASSET_DIMENSION_PX
  )
    return { ok: false, code: "invalid" };
  return {
    ok: true,
    mime: sniffed.mime,
    width: sniffed.width,
    height: sniffed.height,
    byteLength: bytes.byteLength,
  };
}
