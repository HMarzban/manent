// Pure UTF-16BE encoder, decoder and streaming </mos> TCP framer (Uint8Array/DataView only).
import { FormatError } from "../script/model.ts";

/** Maximum wire byte length of one MOS XML message (1 MiB). */
export const MOS_MAX_MESSAGE_BYTES = 1024 * 1024;

const CHUNK_UNITS = 4096;
const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;
const LOW_SURROGATE_MIN = 0xdc00;
const LOW_SURROGATE_MAX = 0xdfff;
const BOM = 0xfeff;
const CLOSE_TAG_PREFIX = "</mos";

const isHighSurrogate = (unit: number): boolean =>
  unit >= HIGH_SURROGATE_MIN && unit <= HIGH_SURROGATE_MAX;

const isLowSurrogate = (unit: number): boolean =>
  unit >= LOW_SURROGATE_MIN && unit <= LOW_SURROGATE_MAX;

const isXmlSpace = (unit: number): boolean =>
  unit === 0x20 || unit === 0x09 || unit === 0x0a || unit === 0x0d;

/** Encodes a well-formed UTF-16 string as big-endian UTF-16 bytes without a BOM. */
export function encodeUtf16Be(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (isHighSurrogate(unit)) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : -1;
      if (!isLowSurrogate(next))
        throw new FormatError(
          "malformed",
          `unpaired high surrogate at offset ${i}`,
        );
      view.setUint16(i * 2, unit, false);
      view.setUint16((i + 1) * 2, next, false);
      i += 1;
      continue;
    }
    if (isLowSurrogate(unit))
      throw new FormatError(
        "malformed",
        `unpaired low surrogate at offset ${i}`,
      );
    view.setUint16(i * 2, unit, false);
  }
  return out;
}

/** Decodes big-endian UTF-16 bytes into a JavaScript string, validating byte parity and surrogate pairs. */
export function decodeUtf16Be(bytes: Uint8Array): string {
  if (bytes.byteLength % 2 !== 0)
    throw new FormatError(
      "malformed",
      `UTF-16BE byte length must be even, got ${bytes.byteLength}`,
    );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalUnits = bytes.byteLength / 2;
  const parts: string[] = [];
  const batch: number[] = [];

  const flush = (): void => {
    if (batch.length === 0) return;
    parts.push(String.fromCharCode(...batch));
    batch.length = 0;
  };

  for (let i = 0; i < totalUnits; i += 1) {
    const unit = view.getUint16(i * 2, false);
    if (isHighSurrogate(unit)) {
      if (i + 1 >= totalUnits)
        throw new FormatError("malformed", "truncated UTF-16BE surrogate pair");
      const next = view.getUint16((i + 1) * 2, false);
      if (!isLowSurrogate(next))
        throw new FormatError("malformed", "invalid UTF-16BE surrogate pair");
      if (batch.length + 2 > CHUNK_UNITS) flush();
      batch.push(unit, next);
      i += 1;
      continue;
    }
    if (isLowSurrogate(unit))
      throw new FormatError("malformed", "unexpected UTF-16BE low surrogate");
    if (batch.length + 1 > CHUNK_UNITS) flush();
    batch.push(unit);
  }
  flush();
  return parts.join("");
}

export interface MosFramer {
  /** Feeds arbitrary TCP bytes and returns zero or more complete `<mos>...</mos>` XML strings. */
  push(chunk: Uint8Array): string[];
  /** Number of raw wire bytes currently buffered for an incomplete message. */
  pendingBytes(): number;
  /** Discards all buffered state. */
  reset(): void;
}

function endsWithMosClose(text: string): boolean {
  let cursor = text.length - 2; // character before '>'
  while (cursor >= 0 && isXmlSpace(text.charCodeAt(cursor))) cursor -= 1;
  const start = cursor - CLOSE_TAG_PREFIX.length + 1;
  if (start < 0) return false;
  return text.slice(start, cursor + 1) === CLOSE_TAG_PREFIX;
}

/** Creates a streaming UTF-16BE MOS TCP framer resilient to odd-byte splits and split surrogate pairs. */
export function createMosFramer(options?: { maxBytes?: number }): MosFramer {
  const maxBytes = options?.maxBytes ?? MOS_MAX_MESSAGE_BYTES;
  let carryByte: number | null = null;
  let carryHigh: number | null = null;
  let inMessage = false;
  let messageBytes = 0;
  let idleBytes = 0;
  let segments: string[] = [];
  let tail = "";

  const reset = (): void => {
    carryByte = null;
    carryHigh = null;
    inMessage = false;
    messageBytes = 0;
    idleBytes = 0;
    segments = [];
    tail = "";
  };

  const appendChar = (char: string): void => {
    tail += char;
    if (tail.length >= CHUNK_UNITS) {
      segments.push(tail);
      tail = "";
    }
  };

  const collectMessage = (): string => {
    const full = segments.length === 0 ? tail : segments.join("") + tail;
    segments = [];
    tail = "";
    return full;
  };

  const acceptUnit = (unit: number, completed: string[]): void => {
    if (carryHigh !== null) {
      if (!isLowSurrogate(unit)) {
        reset();
        throw new FormatError(
          "malformed",
          "invalid UTF-16BE surrogate pair in MOS stream",
        );
      }
      const pair = String.fromCharCode(carryHigh, unit);
      carryHigh = null;
      messageBytes += 4;
      if (messageBytes > maxBytes) {
        reset();
        throw new FormatError(
          "too_large",
          `MOS message exceeds ${maxBytes} bytes`,
        );
      }
      appendChar(pair);
      return;
    }

    if (isHighSurrogate(unit)) {
      if (!inMessage) {
        reset();
        throw new FormatError(
          "malformed",
          "unexpected character before <mos> start tag",
        );
      }
      if (messageBytes + 4 > maxBytes) {
        reset();
        throw new FormatError(
          "too_large",
          `MOS message exceeds ${maxBytes} bytes`,
        );
      }
      carryHigh = unit;
      return;
    }

    if (isLowSurrogate(unit)) {
      reset();
      throw new FormatError(
        "malformed",
        "unexpected UTF-16BE low surrogate in MOS stream",
      );
    }

    if (!inMessage) {
      if (unit === BOM || isXmlSpace(unit)) {
        idleBytes += 2;
        if (idleBytes > maxBytes) {
          reset();
          throw new FormatError(
            "too_large",
            `leading MOS whitespace exceeds ${maxBytes} bytes`,
          );
        }
        return;
      }
      if (unit !== 0x3c) {
        reset();
        throw new FormatError(
          "malformed",
          "expected '<' at start of MOS message",
        );
      }
      inMessage = true;
      idleBytes = 0;
      messageBytes = 0;
    }

    messageBytes += 2;
    if (messageBytes > maxBytes) {
      reset();
      throw new FormatError(
        "too_large",
        `MOS message exceeds ${maxBytes} bytes`,
      );
    }
    appendChar(String.fromCharCode(unit));
    if (unit === 0x3e) {
      const checkWindow =
        tail.length >= 16 || segments.length === 0
          ? tail
          : (segments.at(-1) ?? "") + tail;
      if (endsWithMosClose(checkWindow)) {
        completed.push(collectMessage());
        inMessage = false;
        messageBytes = 0;
      }
    }
  };

  return {
    push(chunk) {
      const completed: string[] = [];
      let offset = 0;
      if (carryByte !== null && chunk.byteLength > 0) {
        const unit = (carryByte << 8) | chunk[0]!;
        carryByte = null;
        offset = 1;
        acceptUnit(unit, completed);
      }
      const limit = chunk.byteLength - 1;
      while (offset < limit) {
        const unit = (chunk[offset]! << 8) | chunk[offset + 1]!;
        offset += 2;
        acceptUnit(unit, completed);
      }
      if (offset < chunk.byteLength) {
        carryByte = chunk[offset]!;
        if (inMessage && messageBytes + 1 > maxBytes) {
          reset();
          throw new FormatError(
            "too_large",
            `MOS message exceeds ${maxBytes} bytes`,
          );
        }
      }
      return completed;
    },
    pendingBytes() {
      return (
        messageBytes +
        (carryHigh !== null ? 2 : 0) +
        (carryByte !== null ? 1 : 0)
      );
    },
    reset,
  };
}
