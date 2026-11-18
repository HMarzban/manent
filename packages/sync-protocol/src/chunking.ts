// Chunking: a message larger than one frame travels as chunks that share a message ID and split
// its body. Reassembly is keyed by the message ID alone, so whole frames, and chunks of other
// messages, may pass between two chunks.
import * as decoding from "lib0/decoding";
import { decodeFrame, prepareMessage } from "./codec.ts";
import type { PreparedMessage } from "./codec.ts";
import { CODE, FRAME_LIMIT_BYTES, MESSAGE_LIMIT_BYTES } from "./constants.ts";
import {
  assertSender,
  encodeHeader,
  readDoc,
  readHeader,
  readSkippedDoc,
} from "./frame.ts";
import type { Chunk, CommonHeader, FrameHeader } from "./frame.ts";
import type { DocRef, Message, Sender } from "./messages.ts";
import { ProtocolError } from "./protocol-error.ts";
import { bad, concat, guard } from "./wire.ts";

/**
 * The message IDs of one connection in one direction: 1, 2, 3 … Every encoder that writes to that
 * connection shares it.
 */
export interface MessageIds {
  next(): number;
}

export function createMessageIds(): MessageIds {
  let last = 0;
  return { next: () => ++last };
}

export interface FrameEncoder {
  /** One frame, or chunks under the connection's next message ID. */
  encode(message: Message | PreparedMessage): Uint8Array[];
}

/**
 * A connection sends only through its frame encoder. A message ID is taken from `ids` only for a
 * message that travels as chunks. `encode` throws RangeError when `frameLimitBytes` (default
 * FRAME_LIMIT_BYTES) cannot hold a chunk header and one body byte.
 */
export function createFrameEncoder(options: {
  ids: MessageIds;
  frameLimitBytes?: number;
}): FrameEncoder {
  const { ids } = options;
  const frameLimitBytes = options.frameLimitBytes ?? FRAME_LIMIT_BYTES;
  return {
    encode(message) {
      const prepared = "body" in message ? message : prepareMessage(message);
      const { body } = prepared;
      const whole = encodeHeader(prepared, null);
      if (whole.byteLength + body.byteLength <= frameLimitBytes)
        return [concat([whole, body])];
      const messageId = ids.next();
      const share =
        frameLimitBytes -
        encodeHeader(prepared, { messageId, more: true }).byteLength;
      if (share < 1)
        throw new RangeError(
          `a frame limit of ${frameLimitBytes} bytes cannot hold a chunk of frame type ${prepared.type}`,
        );
      const frames: Uint8Array[] = [];
      for (let at = 0; at < body.byteLength; at += share) {
        const more = at + share < body.byteLength;
        frames.push(
          concat([
            encodeHeader(prepared, { messageId, more }),
            body.subarray(at, at + share),
          ]),
        );
      }
      return frames;
    },
  };
}

/** What one pushed frame gave. */
export type PushResult =
  | { kind: "message"; message: Message }
  /** A chunk that is not the last. */
  | { kind: "pending" }
  /** A frame, or a whole chunked message, this build does not know. */
  | { kind: "skipped"; frameType: number; doc: DocRef | null };

export interface FrameDecoder {
  push(frame: Uint8Array): PushResult;
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
  frameLimitBytes?: number;
  messageLimitBytes?: number;
  maxPartial?: number;
}): FrameDecoder {
  const { from } = options;
  const frameLimitBytes = options.frameLimitBytes ?? FRAME_LIMIT_BYTES;
  const messageLimitBytes = options.messageLimitBytes ?? MESSAGE_LIMIT_BYTES;
  const maxPartial = options.maxPartial ?? 8;
  // Chunked messages in progress by message ID; "skipping" drops the rest of one.
  const partial = new Map<number, PendingMessage | "skipping">();

  const finish = (header: FrameHeader, body: Uint8Array): PushResult => {
    const message = decodeFrame(header, decoding.createDecoder(body), from);
    return message === null
      ? { kind: "skipped", frameType: header.type, doc: header.doc }
      : { kind: "message", message };
  };
  const makeRoom = (): void => {
    if (partial.size >= maxPartial)
      throw tooLarge(`more than ${maxPartial} chunked messages in progress`);
  };

  const wholeFrame = (
    d: decoding.Decoder,
    header: CommonHeader,
  ): PushResult => {
    if (d.arr.byteLength > messageLimitBytes)
      throw tooLarge(overLimit(messageLimitBytes));
    if (!header.known) return skip(d, header.type);
    const doc = guard(() => readDoc(d, header.type));
    return finish(
      { type: header.type, flags: header.flags, doc },
      d.arr.subarray(d.pos),
    );
  };

  // A chunk to skip drops the message under its ID, and the ID is skipped until its last chunk.
  const skipChunk = (
    d: decoding.Decoder,
    { type }: CommonHeader,
    { messageId, more }: Chunk,
  ): PushResult => {
    if (!more) {
      partial.delete(messageId);
      return skip(d, type);
    }
    if (!partial.has(messageId)) makeRoom();
    partial.set(messageId, "skipping");
    return { kind: "pending" };
  };

  const keepChunk = (
    d: decoding.Decoder,
    { type, flags }: CommonHeader,
    { messageId, more }: Chunk,
    pending: PendingMessage | undefined,
  ): PushResult => {
    const header = { type, flags, doc: guard(() => readDoc(d, type)) };
    const body = d.arr.subarray(d.pos);
    if (pending === undefined) {
      if (!more) return finish(header, body);
      guard(() => assertSender(type, from, body));
      makeRoom();
      if (body.byteLength > messageLimitBytes)
        throw tooLarge(overLimit(messageLimitBytes));
      partial.set(messageId, {
        ...header,
        chunks: [copy(body)],
        size: body.byteLength,
      });
      return { kind: "pending" };
    }
    if (!sameHeader(pending, header)) {
      partial.delete(messageId);
      throw bad(`chunks of message ${messageId} disagree about what it is`);
    }
    if (pending.size + body.byteLength > messageLimitBytes) {
      partial.delete(messageId);
      throw tooLarge(overLimit(messageLimitBytes));
    }
    pending.chunks.push(copy(body));
    pending.size += body.byteLength;
    if (more) return { kind: "pending" };
    partial.delete(messageId);
    return finish(pending, concat(pending.chunks));
  };

  return {
    push(frame) {
      if (frame.byteLength > frameLimitBytes)
        throw tooLarge(
          `a frame of ${frame.byteLength} bytes exceeds ${frameLimitBytes}`,
        );
      const d = decoding.createDecoder(frame);
      const header = guard(() => readHeader(d));
      if (header.chunk === null) return wholeFrame(d, header);
      const pending = partial.get(header.chunk.messageId);
      if (!header.known || pending === "skipping")
        return skipChunk(d, header, header.chunk);
      return keepChunk(d, header, header.chunk, pending);
    },
  };
}

/** A frame this build does not know, with the document it carries when it holds one. */
function skip(d: decoding.Decoder, frameType: number): PushResult {
  return { kind: "skipped", frameType, doc: readSkippedDoc(d, frameType) };
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
