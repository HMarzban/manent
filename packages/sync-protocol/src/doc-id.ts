// Document IDs and the kinds of document the server keeps.

/** Append only: a kind is stored with every document. */
export const DOC_KINDS = [
  "script",
  "comments",
  "index",
  "rundown",
  "outline",
  "room_log",
  "private",
  "ink",
] as const;

export type DocKind = (typeof DOC_KINDS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const hex = (value: number, digits: number): string =>
  value.toString(16).padStart(digits, "0");

export function isDocKind(value: unknown): value is DocKind {
  return DOC_KINDS.some((kind) => kind === value);
}

/** A canonical lower-case UUID, of any version. */
export function isDocId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * A version 7 UUID: 48 bits of `nowMs`, then 74 of the 80 bits in `random`.
 * Throws RangeError unless `random` holds 10 bytes and `nowMs` is an integer
 * that fits in 48 bits.
 */
export function docIdV7(nowMs: number, random: Uint8Array): string {
  if (random.length !== 10)
    throw new RangeError(
      `a version 7 ID takes 10 random bytes, not ${random.length}`,
    );
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs >= 2 ** 48)
    throw new RangeError(
      `a version 7 ID takes a time of 0 to 2^48 - 1 milliseconds, not ${nowMs}`,
    );
  const time = hex(nowMs, 12);
  const bits = Array.from(random, (byte) => hex(byte, 2)).join("");
  // variant 10, then the low 6 bits of byte 2
  const variant = hex(0x80 | (random[2]! & 0x3f), 2);
  return `${time.slice(0, 8)}-${time.slice(8)}-7${bits.slice(0, 3)}-${variant}${bits.slice(6, 8)}-${bits.slice(8)}`;
}
