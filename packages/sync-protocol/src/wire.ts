// The read and write primitives every frame is built from, and the one way a read fails.
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { CODE } from "./constants.ts";
import { VERSION_FIELDS } from "./messages.ts";
import type { DocRef, VersionSet } from "./messages.ts";
import { ProtocolError } from "./protocol-error.ts";

export function bad(message: string): ProtocolError {
  return new ProtocolError(CODE.BAD_FRAME, message);
}

/** Runs a decoding step, turning every failure into ProtocolError 4400. */
export function guard<T>(step: () => T): T {
  try {
    return step();
  } catch (e) {
    if (e instanceof ProtocolError) throw e;
    throw new ProtocolError(CODE.BAD_FRAME, `malformed frame: ${String(e)}`, {
      cause: e,
    });
  }
}

/** Thrown by `readIndex` when a union index is unknown; the frame is then skipped. */
export class UnknownMember extends Error {}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

export function writeNumber(e: encoding.Encoder, n: number): void {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new TypeError(`${n} is not a non-negative safe integer`);
  encoding.writeVarUint(e, n);
}

// A lone surrogate would silently become U+FFFD on the wire.
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function writeString(e: encoding.Encoder, s: string): void {
  if (LONE_SURROGATE.test(s))
    throw new TypeError("a string with a lone surrogate is not valid UTF-16");
  encoding.writeVarString(e, s);
}

export function writeBoolean(e: encoding.Encoder, b: boolean): void {
  encoding.writeUint8(e, b ? 1 : 0);
}

export function writeNullable<T>(
  e: encoding.Encoder,
  value: T | null,
  write: (e: encoding.Encoder, v: T) => void,
): void {
  writeBoolean(e, value !== null);
  if (value !== null) write(e, value);
}

export function writeArray<T>(
  e: encoding.Encoder,
  items: readonly T[],
  write: (e: encoding.Encoder, v: T) => void,
): void {
  writeNumber(e, items.length);
  for (const item of items) write(e, item);
}

export function indexOf<T>(list: readonly T[], value: T): number {
  const i = list.indexOf(value);
  if (i < 0)
    throw new TypeError(`${String(value)} is not one of ${list.join(", ")}`);
  return i;
}

/** A union member as its index, one byte. */
export function writeIndex<T>(
  e: encoding.Encoder,
  list: readonly T[],
  value: T,
): void {
  encoding.writeUint8(e, indexOf(list, value));
}

export function writeVersions(e: encoding.Encoder, v: VersionSet): void {
  for (const field of VERSION_FIELDS) writeNumber(e, v[field]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function writeDocRef(e: encoding.Encoder, ref: DocRef): void {
  if (!UUID.test(ref.docId)) throw new TypeError(`${ref.docId} is not a UUID`);
  const hex = ref.docId.replaceAll("-", "");
  for (let i = 0; i < 32; i += 2)
    encoding.writeUint8(e, Number.parseInt(hex.slice(i, i + 2), 16));
  writeNumber(e, ref.generation);
}

/** lib0's readUint8 returns undefined past the end; this one refuses. */
export function readUint8(d: decoding.Decoder): number {
  if (d.pos >= d.arr.byteLength) throw bad("unexpected end of frame");
  return decoding.readUint8(d);
}

export function readNumber(d: decoding.Decoder): number {
  const n = decoding.readVarUint(d);
  if (!Number.isSafeInteger(n)) throw bad("a number beyond the safe integers");
  return n;
}

/** Copied out, so the message never aliases the frame. */
export function readBytes(d: decoding.Decoder): Uint8Array {
  return decoding.readVarUint8Array(d).slice();
}

export function readBoolean(d: decoding.Decoder): boolean {
  const b = readUint8(d);
  if (b > 1) throw bad(`${b} is not a boolean`);
  return b === 1;
}

export function readNullable<T>(
  d: decoding.Decoder,
  read: (d: decoding.Decoder) => T,
): T | null {
  return readBoolean(d) ? read(d) : null;
}

export function readArray<T>(
  d: decoding.Decoder,
  read: (d: decoding.Decoder) => T,
): T[] {
  const count = readNumber(d);
  const items: T[] = [];
  for (let i = 0; i < count; i++) items.push(read(d));
  return items;
}

export function readIndex<T>(d: decoding.Decoder, list: readonly T[]): T {
  const value = list[readUint8(d)];
  if (value === undefined) throw new UnknownMember();
  return value;
}

export function readVersions(d: decoding.Decoder): VersionSet {
  const versions: VersionSet = { protocol: 0, schema: 0, engine: 0, table: 0 };
  for (const field of VERSION_FIELDS) versions[field] = readNumber(d);
  return versions;
}

const HEX = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

/** docId (16 bytes, written as a canonical lower-case UUID) · generation (varuint). */
export function readDocRef(d: decoding.Decoder): DocRef {
  const raw = decoding.readUint8Array(d, 16);
  const hex = Array.from(raw, (b) => HEX[b]).join("");
  const docId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { docId, generation: readNumber(d) };
}
