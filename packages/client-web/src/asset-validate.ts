// Pure browser-side image validation (magic bytes, 5 MiB size cap, header dimensions <= 4096px)
// and Web Crypto SHA-256 content-addressing.
export const ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const ASSET_MAX_DIMENSION_PX = 4096;

export const SUPPORTED_ASSET_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type SupportedAssetMime = (typeof SUPPORTED_ASSET_MIMES)[number];

export type AssetValidationReason =
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "invalid_header"
  | "dimensions_exceeded";

export class AssetValidationError extends Error {
  readonly reason: AssetValidationReason;

  constructor(reason: AssetValidationReason, message: string) {
    super(message);
    this.name = "AssetValidationError";
    this.reason = reason;
  }
}

export interface ValidatedLocalAsset {
  readonly mime: SupportedAssetMime;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const readU16BE = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset]! << 8) | bytes[offset + 1]!;

const readU16LE = (bytes: Uint8Array, offset: number): number =>
  bytes[offset]! | (bytes[offset + 1]! << 8);

const readU24LE = (bytes: Uint8Array, offset: number): number =>
  bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);

const readU32BE = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset]! << 24) >>> 0) +
  (bytes[offset + 1]! << 16) +
  (bytes[offset + 2]! << 8) +
  bytes[offset + 3]!;

const readU32LE = (bytes: Uint8Array, offset: number): number =>
  bytes[offset]! +
  (bytes[offset + 1]! << 8) +
  (bytes[offset + 2]! << 16) +
  ((bytes[offset + 3]! << 24) >>> 0);

function asciiEquals(
  bytes: Uint8Array,
  offset: number,
  expected: string,
): boolean {
  if (offset + expected.length > bytes.byteLength) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (bytes[offset + i] !== expected.charCodeAt(i)) return false;
  }
  return true;
}

function parsePngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.byteLength < 24 || !asciiEquals(bytes, 12, "IHDR")) return null;
  return { width: readU32BE(bytes, 16), height: readU32BE(bytes, 20) };
}

function isJpegSofMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function parseJpegDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) return null;
    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.byteLength) return null;
    const segmentLength = readU16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength)
      return null;
    if (isJpegSofMarker(marker)) {
      if (segmentLength < 7 || offset + 7 > bytes.byteLength) return null;
      return {
        height: readU16BE(bytes, offset + 3),
        width: readU16BE(bytes, offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function parseWebpDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.byteLength < 20) return null;
  if (asciiEquals(bytes, 12, "VP8X")) {
    if (bytes.byteLength < 30) return null;
    return {
      width: readU24LE(bytes, 24) + 1,
      height: readU24LE(bytes, 27) + 1,
    };
  }
  if (asciiEquals(bytes, 12, "VP8 ")) {
    if (
      bytes.byteLength < 30 ||
      bytes[23] !== 0x9d ||
      bytes[24] !== 0x01 ||
      bytes[25] !== 0x2a
    )
      return null;
    return {
      width: readU16LE(bytes, 26) & 0x3fff,
      height: readU16LE(bytes, 28) & 0x3fff,
    };
  }
  if (asciiEquals(bytes, 12, "VP8L")) {
    if (bytes.byteLength < 25 || bytes[20] !== 0x2f) return null;
    const bits = readU32LE(bytes, 21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

function sniffMime(bytes: Uint8Array): SupportedAssetMime | null {
  if (
    bytes.byteLength >= 8 &&
    PNG_SIG.every((value, index) => bytes[index] === value)
  )
    return "image/png";
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8)
    return "image/jpeg";
  if (
    bytes.byteLength >= 12 &&
    asciiEquals(bytes, 0, "RIFF") &&
    asciiEquals(bytes, 8, "WEBP")
  )
    return "image/webp";
  return null;
}

/** Validates image magic bytes, 5 MiB size cap and header dimensions (1..4096 px) locally before staging. */
export function validateLocalAssetBytes(
  bytes: Uint8Array,
): ValidatedLocalAsset {
  if (bytes.byteLength === 0)
    throw new AssetValidationError("empty", "Image file is empty.");
  if (bytes.byteLength > ASSET_MAX_BYTES)
    throw new AssetValidationError(
      "too_large",
      "Image exceeds the 5 MiB size limit.",
    );
  const mime = sniffMime(bytes);
  if (mime === null)
    throw new AssetValidationError(
      "unsupported_type",
      "Only PNG, JPEG and WebP images are supported.",
    );
  const dims =
    mime === "image/png"
      ? parsePngDimensions(bytes)
      : mime === "image/jpeg"
        ? parseJpegDimensions(bytes)
        : parseWebpDimensions(bytes);
  if (dims === null || dims.width < 1 || dims.height < 1)
    throw new AssetValidationError(
      "invalid_header",
      "Image header dimensions could not be read.",
    );
  if (
    dims.width > ASSET_MAX_DIMENSION_PX ||
    dims.height > ASSET_MAX_DIMENSION_PX
  )
    throw new AssetValidationError(
      "dimensions_exceeded",
      "Image dimensions exceed 4096 by 4096 pixels.",
    );
  return {
    mime,
    width: dims.width,
    height: dims.height,
    byteLength: bytes.byteLength,
  };
}

/** Computes lowercase 64-character hex SHA-256 via Web Crypto. */
export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}
