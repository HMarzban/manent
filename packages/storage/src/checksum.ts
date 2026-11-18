// The checks stored beside the bytes: CRC-32 on each update, SHA-256 on each checkpoint.

/** CRC-32 (IEEE) as an unsigned 32-bit integer. */
export function crc32(bytes: Uint8Array): number {
  return Bun.hash.crc32(bytes);
}

/** SHA-256: 32 bytes. */
export function sha256(bytes: Uint8Array): Uint8Array {
  const digest = new Uint8Array(32);
  Bun.SHA256.hash(bytes, digest);
  return digest;
}
