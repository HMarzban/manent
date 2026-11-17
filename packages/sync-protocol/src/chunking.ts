// Chunking: a message larger than one frame travels as chunks that share a message ID.
//
// Every chunk repeats the header (type · flags · messageId · [docId · generation]), sets CHUNK,
// and sets MORE on all but the last; the body is split between them. Reassembly is keyed by the
// message ID alone, so whole frames, and chunks of other messages, may pass between two chunks.
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import {
  CODE,
  FRAME_LIMIT_BYTES,
  MESSAGE_LIMIT_BYTES,
  ProtocolError,
} from "./codes.ts";
import {
  FLAG,
  assertSender,
  decodeMessage,
  frameParts,
  guard,
  isDocumentType,
  isKnownFrame,
  readBody,
  readDocRef,
  readTypeAndFlags,
  writeHeader,
} from "./codec.ts";
import type { DocRef, Message, Sender } from "./messages.ts";

export interface FrameEncoder {
  /** One frame, or chunks sharing a fresh message ID. */
  encode(message: Message): Uint8Array[];
}

/**
 * Message IDs count 1, 2, 3 … per encoder and are spent only on chunked messages. `encode` throws
 * RangeError when `frameLimit` cannot hold a chunk header and one body byte.
 */
export function createFrameEncoder(options?: {
  frameLimit?: number;
}): FrameEncoder {
  const frameLimit = options?.frameLimit ?? FRAME_LIMIT_BYTES;
  let nextId = 1;
  return {
    encode(message) {
      const parts = frameParts(message);
      const docBytes = parts.doc ? 16 + varUintLength(parts.doc.generation) : 0;
      if (2 + docBytes + parts.body.byteLength <= frameLimit) {
        const e = encoding.createEncoder();
        writeHeader(e, parts, null);
        encoding.writeUint8Array(e, parts.body);
        return [encoding.toUint8Array(e)];
      }
      const messageId = nextId;
      const share = frameLimit - (2 + varUintLength(messageId) + docBytes);
      if (share < 1)
        throw new RangeError(
          `a frame limit of ${frameLimit} bytes cannot hold a chunk of ${message.type}`,
        );
      nextId++;
      const frames: Uint8Array[] = [];
      for (let at = 0; at < parts.body.byteLength; at += share) {
        const more = at + share < parts.body.byteLength;
        const e = encoding.createEncoder();
        writeHeader(e, parts, { messageId, more });
        encoding.writeUint8Array(e, parts.body.subarray(at, at + share));
        frames.push(encoding.toUint8Array(e));
      }
      return frames;
    },
  };
}

export interface FrameDecoder {
  /** null: a chunk that is not the last, or a frame that was skipped. */
  push(frame: Uint8Array): Message | null;
  /** Messages this build did not know: one per unchunked frame, one per chunked message. */
  readonly skipped: number;
}

interface Partial {
  type: number;
  flags: number;
  doc: DocRef | null;
  chunks: Uint8Array[];
  size: number;
}

/** Defaults: FRAME_LIMIT_BYTES, MESSAGE_LIMIT_BYTES, 8 chunked messages in progress at once. */
export function createFrameDecoder(options: {
  from: Sender;
  frameLimit?: number;
  messageLimit?: number;
  maxPartial?: number;
}): FrameDecoder {
  const { from } = options;
  const frameLimit = options.frameLimit ?? FRAME_LIMIT_BYTES;
  const messageLimit = options.messageLimit ?? MESSAGE_LIMIT_BYTES;
  const maxPartial = options.maxPartial ?? 8;
  const partials = new Map<number, Partial>();
  let skipped = 0;

  const finish = (
    header: Omit<Partial, "chunks" | "size">,
    body: Uint8Array,
  ) => {
    const message = guard(() =>
      readBody(decoding.createDecoder(body), header, from),
    );
    if (message === null) skipped++;
    return message;
  };

  return {
    get skipped() {
      return skipped;
    },
    push(frame) {
      if (frame.byteLength > frameLimit)
        throw tooLarge(
          `a frame of ${frame.byteLength} bytes exceeds ${frameLimit}`,
        );
      const d = decoding.createDecoder(frame);
      const { type, flags } = readTypeAndFlags(d);
      const known = isKnownFrame(type, flags);
      if (!(flags & FLAG.CHUNK)) {
        const message = known ? decodeMessage(frame, from) : null;
        if (message === null) skipped++;
        return message;
      }
      const messageId = guard(() => decoding.readVarUint(d));
      const more = (flags & FLAG.MORE) !== 0;
      if (!known) {
        if (!more) skipped++;
        return null;
      }
      const header = {
        type,
        flags: flags & ~(FLAG.CHUNK | FLAG.MORE),
        doc: isDocumentType(type) ? guard(() => readDocRef(d)) : null,
      };
      const body = frame.subarray(d.pos);
      const partial = partials.get(messageId);

      if (partial === undefined) {
        guard(() => assertSender(type, from));
        if (!more) return finish(header, body);
        if (partials.size >= maxPartial)
          throw tooLarge(
            `more than ${maxPartial} chunked messages in progress`,
          );
        if (body.byteLength > messageLimit)
          throw tooLarge(overLimit(messageLimit));
        partials.set(messageId, {
          ...header,
          chunks: [body.slice()],
          size: body.byteLength,
        });
        return null;
      }

      if (!sameHeader(partial, header)) {
        partials.delete(messageId);
        throw new ProtocolError(
          CODE.BAD_FRAME,
          `chunks of message ${messageId} disagree about what it is`,
        );
      }
      if (partial.size + body.byteLength > messageLimit) {
        partials.delete(messageId);
        throw tooLarge(overLimit(messageLimit));
      }
      partial.chunks.push(body.slice());
      partial.size += body.byteLength;
      if (more) return null;
      partials.delete(messageId);
      return finish(partial, concat(partial.chunks, partial.size));
    },
  };
}

function sameHeader(
  a: Partial,
  b: { type: number; flags: number; doc: DocRef | null },
): boolean {
  return (
    a.type === b.type &&
    a.flags === b.flags &&
    a.doc?.docId === b.doc?.docId &&
    a.doc?.generation === b.doc?.generation
  );
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

function tooLarge(message: string): ProtocolError {
  return new ProtocolError(CODE.TOO_LARGE, message);
}

function overLimit(limit: number): string {
  return `a message exceeds ${limit} bytes`;
}

function varUintLength(n: number): number {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, n);
  return encoding.length(e);
}
