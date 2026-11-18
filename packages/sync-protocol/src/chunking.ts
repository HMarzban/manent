// Chunking: a message larger than one frame travels as chunks that share a message ID and split
// its body. Reassembly is keyed by the message ID alone, so whole frames, and chunks of other
// messages, may pass between two chunks.
import * as decoding from "lib0/decoding";
import { decodeFrame, frameParts } from "./codec.ts";
import { CODE, FRAME_LIMIT_BYTES, MESSAGE_LIMIT_BYTES } from "./constants.ts";
import { assertSender, encodeHeader, readDoc, readHeader } from "./frame.ts";
import type { Chunk, CommonHeader, FrameHeader } from "./frame.ts";
import type { Message, Sender } from "./messages.ts";
import { ProtocolError } from "./protocol-error.ts";
import { bad, concat, guard } from "./wire.ts";

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
      const whole = encodeHeader(parts, null);
      if (whole.byteLength + parts.body.byteLength <= frameLimit)
        return [concat([whole, parts.body])];
      const messageId = nextId;
      const share =
        frameLimit - encodeHeader(parts, { messageId, more: true }).byteLength;
      if (share < 1)
        throw new RangeError(
          `a frame limit of ${frameLimit} bytes cannot hold a chunk of ${message.type}`,
        );
      nextId++;
      const frames: Uint8Array[] = [];
      for (let at = 0; at < parts.body.byteLength; at += share) {
        const more = at + share < parts.body.byteLength;
        frames.push(
          concat([
            encodeHeader(parts, { messageId, more }),
            parts.body.subarray(at, at + share),
          ]),
        );
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

interface PendingMessage extends FrameHeader {
  chunks: Uint8Array[];
  size: number;
}

/**
 * Defaults: FRAME_LIMIT_BYTES, MESSAGE_LIMIT_BYTES, 8 chunked messages in progress at once. A
 * chunked message being skipped counts against that limit as well: its ID is kept so that its
 * later chunks are dropped with it.
 */
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
  // Chunked messages in progress by message ID; "skipping" drops the rest of one.
  const partial = new Map<number, PendingMessage | "skipping">();
  let skipped = 0;

  const finish = (header: FrameHeader, body: Uint8Array): Message | null => {
    const message = decodeFrame(header, decoding.createDecoder(body), from);
    if (message === null) skipped++;
    return message;
  };
  const makeRoom = (): void => {
    if (partial.size >= maxPartial)
      throw tooLarge(`more than ${maxPartial} chunked messages in progress`);
  };

  const wholeFrame = (
    d: decoding.Decoder,
    header: CommonHeader,
  ): Message | null => {
    if (d.arr.byteLength > messageLimit)
      throw tooLarge(overLimit(messageLimit));
    if (!header.known) {
      skipped++;
      return null;
    }
    const doc = guard(() => readDoc(d, header.type));
    return finish(
      { type: header.type, flags: header.flags, doc },
      d.arr.subarray(d.pos),
    );
  };

  // A chunk to skip drops the message under its ID, and the ID is skipped until its last chunk.
  const skipChunk = ({ messageId, more }: Chunk): null => {
    if (!more) {
      partial.delete(messageId);
      skipped++;
      return null;
    }
    if (!partial.has(messageId)) makeRoom();
    partial.set(messageId, "skipping");
    return null;
  };

  const keepChunk = (
    d: decoding.Decoder,
    { type, flags }: CommonHeader,
    { messageId, more }: Chunk,
    pending: PendingMessage | undefined,
  ): Message | null => {
    const header = { type, flags, doc: guard(() => readDoc(d, type)) };
    const body = d.arr.subarray(d.pos);
    if (pending === undefined) {
      if (!more) return finish(header, body);
      guard(() => assertSender(type, from, body));
      makeRoom();
      if (body.byteLength > messageLimit)
        throw tooLarge(overLimit(messageLimit));
      partial.set(messageId, {
        ...header,
        chunks: [copy(body)],
        size: body.byteLength,
      });
      return null;
    }
    if (!sameHeader(pending, header)) {
      partial.delete(messageId);
      throw bad(`chunks of message ${messageId} disagree about what it is`);
    }
    if (pending.size + body.byteLength > messageLimit) {
      partial.delete(messageId);
      throw tooLarge(overLimit(messageLimit));
    }
    pending.chunks.push(copy(body));
    pending.size += body.byteLength;
    if (more) return null;
    partial.delete(messageId);
    return finish(pending, concat(pending.chunks));
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
      const header = guard(() => readHeader(d));
      if (header.chunk === null) return wholeFrame(d, header);
      const pending = partial.get(header.chunk.messageId);
      if (!header.known || pending === "skipping")
        return skipChunk(header.chunk);
      return keepChunk(d, header, header.chunk, pending);
    },
  };
}

/** A copy that never aliases the input: a Buffer's `slice()` is a view, not a copy. */
function copy(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function sameHeader(a: FrameHeader, b: FrameHeader): boolean {
  return (
    a.type === b.type &&
    a.flags === b.flags &&
    a.doc?.docId === b.doc?.docId &&
    a.doc?.generation === b.doc?.generation
  );
}

function tooLarge(message: string): ProtocolError {
  return new ProtocolError(CODE.TOO_LARGE, message);
}

function overLimit(limit: number): string {
  return `a message exceeds ${limit} bytes`;
}
