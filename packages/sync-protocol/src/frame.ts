// The header every frame starts with, known or not, and who may send each frame type:
// type (u8) · flags (u8) · [messageId (varuint), when CHUNK is set] · [docId (16 bytes) ·
// generation (varuint), on a document frame] · body.
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { FRAME } from "./constants.ts";
import { SYNC_STEPS } from "./messages.ts";
import type { DocRef, Sender } from "./messages.ts";
import {
  bad,
  readDocRef,
  readNumber,
  writeDocRef,
  writeNumber,
} from "./wire.ts";

export const FLAG = {
  /** Another chunk of this message follows. */
  MORE: 1 << 0,
  /** Type 5 only: this heartbeat is the reply. */
  PONG: 1 << 1,
  /** Type 4 only: the body starts with docId · generation. */
  HAS_DOC: 1 << 2,
  /** This frame is one chunk of a larger message; a messageId follows the flags. */
  CHUNK: 1 << 3,
} as const;

const KNOWN_FLAGS = FLAG.MORE | FLAG.PONG | FLAG.HAS_DOC | FLAG.CHUNK;
// Types 0–15 are connection frames, 16–127 document frames. Type bytes 128–255 are unknown today,
// skipped like the rest; any future use of the top bit must keep the common header.
const FIRST_DOCUMENT_TYPE = 16;
const TYPE_LIMIT = 128;

export type FrameName = keyof typeof FRAME;

function isFrameName(name: string): name is FrameName {
  return name in FRAME;
}

const NAME_OF = new Map(
  Object.keys(FRAME)
    .filter(isFrameName)
    .map((name): [number, FrameName] => [FRAME[name], name]),
);

/** Who may send each frame type. A client's SYNC is narrowed by its step as well. */
const SENT_BY: Record<FrameName, Sender | "both"> = {
  HELLO: "client",
  WELCOME: "server",
  AUTH_EXPIRING: "server",
  AUTH_REFRESH: "client",
  ERROR: "server",
  PING: "both",
  SUBSCRIBE: "client",
  SUBSCRIBED: "server",
  GENERATION_MOVED: "server",
  UNSUBSCRIBE: "client",
  SYNC: "both",
  PUSH: "client",
  ACK: "server",
  AWARENESS: "both",
  CONTROL: "server",
  VIEW_SNAPSHOT: "server",
  VIEW_PATCH: "server",
  SET: "client",
};

/** What every frame of one message repeats. */
export interface FrameHeader {
  type: number;
  /** PONG and HAS_DOC; never MORE or CHUNK. */
  flags: number;
  /** The document of a document frame (types 16–127); null for a connection frame. */
  doc: DocRef | null;
}

/**
 * What a chunk adds to the header: its message's ID, and whether another chunk follows. Every
 * chunk of one message repeats its header and carries the same flags byte, MORE aside.
 */
export interface Chunk {
  messageId: number;
  more: boolean;
}

/**
 * True when this build knows the frame type and every flag on it (CHUNK fits any type, MORE only
 * with CHUNK, PONG only type 5, HAS_DOC only type 4). Anything else is skipped.
 */
function isKnownFrame(type: number, flags: number): boolean {
  if (!NAME_OF.has(type) || (flags & ~KNOWN_FLAGS) !== 0) return false;
  if (flags & FLAG.PONG && type !== FRAME.PING) return false;
  if (flags & FLAG.HAS_DOC && type !== FRAME.ERROR) return false;
  if (flags & FLAG.MORE && !(flags & FLAG.CHUNK)) return false;
  return true;
}

/** type · flags · [messageId] · [docId · generation]. CHUNK and MORE are set from `chunk`. */
export function encodeHeader(
  parts: FrameHeader,
  chunk: Chunk | null,
): Uint8Array {
  const e = encoding.createEncoder();
  let flags = parts.flags;
  if (chunk) flags |= FLAG.CHUNK | (chunk.more ? FLAG.MORE : 0);
  encoding.writeUint8(e, parts.type);
  encoding.writeUint8(e, flags);
  if (chunk) writeNumber(e, chunk.messageId);
  if (parts.doc) writeDocRef(e, parts.doc);
  return encoding.toUint8Array(e);
}

/** type · flags · [messageId], as every frame starts. */
export interface CommonHeader {
  type: number;
  /** Without CHUNK and MORE, which `chunk` states. */
  flags: number;
  /** False for a type or a flag this build does not know. */
  known: boolean;
  chunk: Chunk | null;
}

/** Throws ProtocolError 4400 on a frame shorter than two bytes. */
export function readHeader(d: decoding.Decoder): CommonHeader {
  if (d.arr.byteLength - d.pos < 2) throw bad("a frame is at least two bytes");
  const type = decoding.readUint8(d);
  const flags = decoding.readUint8(d);
  return {
    type,
    flags: flags & ~(FLAG.CHUNK | FLAG.MORE),
    known: isKnownFrame(type, flags),
    chunk:
      flags & FLAG.CHUNK
        ? { messageId: readNumber(d), more: (flags & FLAG.MORE) !== 0 }
        : null,
  };
}

/**
 * The docId · generation after the header of a document frame; null for a connection frame. For
 * types 16–127 they always follow the common header, whatever flags a newer build sets.
 */
export function readDoc(d: decoding.Decoder, type: number): DocRef | null {
  return type >= FIRST_DOCUMENT_TYPE && type < TYPE_LIMIT
    ? readDocRef(d)
    : null;
}

/**
 * ProtocolError 4400 unless `from` may send frames of this known type. `body` is the start of the
 * body: a client's SYNC is refused unless its step, the body's first varuint, is step1. A step this
 * build does not know passes, and the body reader skips the frame.
 */
export function assertSender(
  type: number,
  from: Sender,
  body: Uint8Array,
): FrameName {
  const name = NAME_OF.get(type);
  if (name === undefined) throw bad(`unknown frame type ${type}`);
  const sentBy = SENT_BY[name];
  if (sentBy !== "both" && sentBy !== from)
    throw bad(`a ${from} may not send ${name}`);
  if (name === "SYNC" && from === "client") {
    const step = SYNC_STEPS[readNumber(decoding.createDecoder(body))];
    if (step !== undefined && step !== "step1")
      throw bad(`a client may not send SYNC ${step}`);
  }
  return name;
}
