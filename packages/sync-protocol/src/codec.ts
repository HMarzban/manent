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
import type { Message, Sender } from "./messages.ts";
import { UnknownMember, bad, concat, guard } from "./wire.ts";

/** A message split into what every frame of it repeats and the body that may be split. */
interface FrameParts extends FrameHeader {
  body: Uint8Array;
}

export function frameParts(message: Message): FrameParts {
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

/** One frame. Throws RangeError when it would exceed FRAME_LIMIT_BYTES; TypeError on a bad field. */
export function encodeMessage(message: Message): Uint8Array {
  const parts = frameParts(message);
  const frame = concat([encodeHeader(parts, null), parts.body]);
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
