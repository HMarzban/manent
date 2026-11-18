// The frame codec: a message to one frame and back. A frame of a type, flag or union member this
// build does not know decodes to null and is skipped; bytes after the last field this build knows
// are ignored. So additions never lock an older build out.
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { readBody, writeBody } from "./body.ts";
import { FRAME, FRAME_LIMIT_BYTES } from "./constants.ts";
import {
  FLAG,
  assertSender,
  encodeHeader,
  readDoc,
  readHeader,
} from "./frame.ts";
import type { FrameHeader } from "./frame.ts";
import type { DocRef, Message, Sender } from "./messages.ts";
import { UnknownMember, bad, concat, guard } from "./wire.ts";

/** A message whose body is already encoded; any number of connections may frame it. */
export interface PreparedMessage {
  readonly type: number;
  readonly flags: number;
  readonly doc: DocRef | null;
  readonly body: Uint8Array;
}

export function prepareMessage(message: Message): PreparedMessage {
  const type = FRAME[message.type === "PONG" ? "PING" : message.type];
  let flags = 0;
  if (message.type === "PONG") flags |= FLAG.PONG;
  if (message.type === "ERROR" && message.doc !== null) flags |= FLAG.HAS_DOC;
  const doc =
    "docId" in message
      ? { docId: message.docId, generation: message.generation }
      : null;
  const e = encoding.createEncoder();
  writeBody(e, message);
  return { type, flags, doc, body: encoding.toUint8Array(e) };
}

/**
 * One frame, for tests and for frames that are always small: a connection sends only through its
 * frame encoder. Throws RangeError when it would exceed FRAME_LIMIT_BYTES; TypeError on a bad field.
 */
export function encodeMessage(message: Message): Uint8Array {
  const prepared = prepareMessage(message);
  const frame = concat([encodeHeader(prepared, null), prepared.body]);
  if (frame.byteLength > FRAME_LIMIT_BYTES)
    throw new RangeError(
      `a ${message.type} frame of ${frame.byteLength} bytes exceeds the frame limit`,
    );
  return frame;
}

/** A frame from `from`, or null for a frame this build does not know, to be skipped. */
export function decodeMessage(frame: Uint8Array, from: Sender): Message | null {
  const d = decoding.createDecoder(frame);
  const header = guard(() => readHeader(d));
  if (!header.known) return null;
  if (header.chunk) throw bad("a chunk is not a whole message");
  const doc = guard(() => readDoc(d, header.type));
  return decodeFrame({ type: header.type, flags: header.flags, doc }, d, from);
}

/**
 * The message whose body `d` holds, the header already read: ProtocolError 4400 unless `from` may
 * send it and the body is well formed; null when the body names a union member this build does not
 * know.
 */
export function decodeFrame(
  header: FrameHeader,
  d: decoding.Decoder,
  from: Sender,
): Message | null {
  return guard(() => {
    const name = assertSender(header.type, from, d.arr.subarray(d.pos));
    try {
      return readBody(d, name, header);
    } catch (e) {
      if (e instanceof UnknownMember) return null;
      throw e;
    }
  });
}
