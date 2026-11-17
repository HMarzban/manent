// The frame codec.
//
// Every frame, known or not:  type (u8) · flags (u8) · [messageId (varuint), only when CHUNK is set] · rest
//   connection frame (types 0–15):    rest = body
//   document frame (types 16–127):    rest = docId (16 bytes) · generation (varuint) · body
//
// A frame of a type, flag or union member this build does not know decodes to null and is skipped;
// bytes after the last field this build knows are ignored. So additions never lock an older build out.
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { CODE, FRAME, FRAME_LIMIT_BYTES, ProtocolError } from "./codes.ts";
import type {
  Capability,
  ControlKind,
  DocRef,
  DocRole,
  LockAnchor,
  Message,
  Sender,
  SubscribeMode,
  VersionSet,
} from "./messages.ts";

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
const FIRST_DOCUMENT_TYPE = 16;
const TYPE_LIMIT = 128;

// String unions travel as their index in declaration order. Appending is safe; reordering never is.
const ROLES: readonly DocRole[] = ["owner", "edit", "comment", "view"];
const CAPABILITIES: readonly Capability[] = [
  "send_to_prompter",
  "edit_rundowns",
  "issue_revisions",
  "lock_page_numbers",
  "delete",
];
const MODES: readonly SubscribeMode[] = ["edit", "view", "prompter"];
const CONTROL_KINDS: readonly ControlKind[] = [
  "version_created",
  "draft_named",
  "revision_issued",
  "revision_recalled",
  "lock_anchors_changed",
  "layout_changed",
  "membership_changed",
  "restored",
  "sent_to_prompter",
  "upstream_status",
];
const SYNC_STEPS = ["step1", "step2", "update"] as const;

type FrameName = keyof typeof FRAME;
const NAME_OF = new Map<number, FrameName>(
  Object.entries(FRAME).map(([name, type]) => [type, name as FrameName]),
);

/** Who may send each frame type. SYNC is narrowed by its step once the body is read. */
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
};

export function isDocumentType(type: number): boolean {
  return type >= FIRST_DOCUMENT_TYPE && type < TYPE_LIMIT;
}

/**
 * True when this build knows the frame type and every flag on it (MORE and CHUNK fit any type;
 * PONG only type 5, HAS_DOC only type 4). Anything else is skipped.
 */
export function isKnownFrame(type: number, flags: number): boolean {
  if (!NAME_OF.has(type) || (flags & ~KNOWN_FLAGS) !== 0) return false;
  if (flags & FLAG.PONG && type !== FRAME.PING) return false;
  if (flags & FLAG.HAS_DOC && type !== FRAME.ERROR) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Encoding

/** A message split into what every frame of it repeats and the body that may be split. */
export interface FrameParts {
  type: number;
  /** PONG and HAS_DOC; never MORE or CHUNK. */
  flags: number;
  /** The document of a document frame (types 16–127); null for a connection frame. */
  doc: DocRef | null;
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

/** Writes type · flags · [messageId] · [docId · generation]. CHUNK is set when `messageId` is given. */
export function writeHeader(
  e: encoding.Encoder,
  parts: Pick<FrameParts, "type" | "flags" | "doc">,
  chunk: { messageId: number; more: boolean } | null,
): void {
  let flags = parts.flags;
  if (chunk) flags |= FLAG.CHUNK | (chunk.more ? FLAG.MORE : 0);
  encoding.writeUint8(e, parts.type);
  encoding.writeUint8(e, flags);
  if (chunk) writeNumber(e, chunk.messageId);
  if (parts.doc) writeDocRef(e, parts.doc);
}

/** One frame. Throws RangeError when it would exceed FRAME_LIMIT_BYTES; TypeError on a bad field. */
export function encodeMessage(message: Message): Uint8Array {
  const parts = frameParts(message);
  const e = encoding.createEncoder();
  writeHeader(e, parts, null);
  encoding.writeUint8Array(e, parts.body);
  const frame = encoding.toUint8Array(e);
  if (frame.byteLength > FRAME_LIMIT_BYTES)
    throw new RangeError(
      `a ${message.type} frame of ${frame.byteLength} bytes exceeds the frame limit`,
    );
  return frame;
}

function writeBody(e: encoding.Encoder, m: Message): void {
  switch (m.type) {
    case "HELLO":
      writeVersions(e, m.versions);
      encoding.writeVarString(e, m.build);
      encoding.writeVarString(e, m.deviceId);
      return;
    case "WELCOME":
      encoding.writeVarString(e, m.session.userId);
      encoding.writeVarString(e, m.session.name);
      writeNumber(e, m.limits.frameBytes);
      writeNumber(e, m.limits.messageBytes);
      writeVersions(e, m.server.current);
      writeVersions(e, m.server.min);
      return;
    case "AUTH_EXPIRING":
      writeNumber(e, m.secondsLeft);
      return;
    case "AUTH_REFRESH":
      encoding.writeVarString(e, m.ticket);
      return;
    case "ERROR":
      if (m.doc) writeDocRef(e, m.doc);
      writeNumber(e, m.code);
      encoding.writeVarString(e, m.message);
      writeNullable(e, m.retryAfterMs, writeNumber);
      writeBoolean(e, m.permanent);
      return;
    case "PING":
    case "PONG":
      writeNumber(e, m.nonce);
      return;
    case "SUBSCRIBE":
      writeIndex(e, MODES, m.mode);
      writeArray(e, m.clientIds, writeNumber);
      writeNumber(e, m.lastServerSeq);
      return;
    case "SUBSCRIBED":
      writeIndex(e, ROLES, m.role);
      writeArray(e, m.capabilities, (enc, c) =>
        writeIndex(enc, CAPABILITIES, c),
      );
      writeNumber(e, m.headSeq);
      writeNumber(e, m.minSchema);
      writeNumber(e, m.engineVersion);
      writeNumber(e, m.lockLevel);
      if (m.lockAnchors === null) encoding.writeUint8(e, 0);
      else if ("table" in m.lockAnchors) {
        encoding.writeUint8(e, 1);
        writeArray(e, m.lockAnchors.table, writeLockAnchor);
      } else {
        encoding.writeUint8(e, 2);
        encoding.writeVarUint8Array(e, m.lockAnchors.hash);
      }
      writeNullable(e, m.revision, (enc, r) => {
        encoding.writeVarString(enc, r.setId);
        encoding.writeVarString(enc, r.baselineVersionId);
      });
      writeNullable(e, m.airWindow, (enc, w) => {
        writeNumber(enc, w.startsAt);
        writeNumber(enc, w.endsAt);
      });
      return;
    case "GENERATION_MOVED":
      writeNumber(e, m.newGeneration);
      return;
    case "UNSUBSCRIBE":
      return;
    case "SYNC":
      writeNumber(e, indexOf(SYNC_STEPS, m.step));
      encoding.writeVarUint8Array(e, m.data);
      return;
    case "PUSH":
      writeNumber(e, m.clientSeq);
      encoding.writeVarUint8Array(e, m.update);
      writeBoolean(e, m.heal);
      return;
    case "ACK":
      writeNumber(e, m.clientSeq);
      writeNumber(e, m.serverSeq);
      return;
    case "AWARENESS":
      encoding.writeVarUint8Array(e, m.update);
      return;
    case "CONTROL":
      writeNumber(e, m.seq);
      writeIndex(e, CONTROL_KINDS, m.kind);
      encoding.writeVarUint8Array(e, m.data);
      return;
    case "VIEW_SNAPSHOT":
      writeNumber(e, m.viewSeq);
      encoding.writeVarUint8Array(e, m.content);
      return;
    case "VIEW_PATCH":
      writeNumber(e, m.viewSeq);
      encoding.writeVarUint8Array(e, m.patch);
      return;
  }
}

function writeNumber(e: encoding.Encoder, n: number): void {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new TypeError(`${n} is not a non-negative safe integer`);
  encoding.writeVarUint(e, n);
}

function writeBoolean(e: encoding.Encoder, b: boolean): void {
  encoding.writeUint8(e, b ? 1 : 0);
}

function writeNullable<T>(
  e: encoding.Encoder,
  value: T | null,
  write: (e: encoding.Encoder, v: T) => void,
): void {
  writeBoolean(e, value !== null);
  if (value !== null) write(e, value);
}

function writeArray<T>(
  e: encoding.Encoder,
  items: readonly T[],
  write: (e: encoding.Encoder, v: T) => void,
): void {
  writeNumber(e, items.length);
  for (const item of items) write(e, item);
}

function indexOf<T>(list: readonly T[], value: T): number {
  const i = list.indexOf(value);
  if (i < 0)
    throw new TypeError(`${String(value)} is not one of ${list.join(", ")}`);
  return i;
}

function writeIndex<T>(
  e: encoding.Encoder,
  list: readonly T[],
  value: T,
): void {
  encoding.writeUint8(e, indexOf(list, value));
}

function writeVersions(e: encoding.Encoder, v: VersionSet): void {
  writeNumber(e, v.protocol);
  writeNumber(e, v.schema);
  writeNumber(e, v.engine);
  writeNumber(e, v.table);
}

function writeLockAnchor(e: encoding.Encoder, a: LockAnchor): void {
  writeNumber(e, a.level);
  writeNumber(e, a.order);
  encoding.writeVarString(e, a.label);
  encoding.writeVarString(e, a.blockId);
  writeNumber(e, a.offset);
  encoding.writeVarString(e, a.quote);
  writeArray(e, a.fallbackIds, encoding.writeVarString);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function writeDocRef(e: encoding.Encoder, ref: DocRef): void {
  if (!UUID.test(ref.docId)) throw new TypeError(`${ref.docId} is not a UUID`);
  const hex = ref.docId.replaceAll("-", "");
  for (let i = 0; i < 32; i += 2)
    encoding.writeUint8(e, Number.parseInt(hex.slice(i, i + 2), 16));
  writeNumber(e, ref.generation);
}

// ---------------------------------------------------------------------------------------------
// Decoding

/** A frame from `from`, or null for a frame this build does not know, to be skipped. */
export function decodeMessage(frame: Uint8Array, from: Sender): Message | null {
  const d = decoding.createDecoder(frame);
  const { type, flags } = readTypeAndFlags(d);
  if (!isKnownFrame(type, flags)) return null;
  return guard(() => {
    if (flags & (FLAG.CHUNK | FLAG.MORE))
      throw bad("a chunk is not a whole message");
    const doc = isDocumentType(type) ? readDocRef(d) : null;
    return readBody(d, { type, flags, doc }, from);
  });
}

/** Reads the two bytes every frame starts with. Fewer than two: ProtocolError 4400. */
export function readTypeAndFlags(d: decoding.Decoder): {
  type: number;
  flags: number;
} {
  if (d.arr.byteLength - d.pos < 2) throw bad("a frame is at least two bytes");
  return { type: decoding.readUint8(d), flags: decoding.readUint8(d) };
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

function bad(message: string): ProtocolError {
  return new ProtocolError(CODE.BAD_FRAME, message);
}

/** Thrown inside the body reader when a union index is unknown; the frame is then skipped. */
class UnknownMember extends Error {}

/**
 * The message in a known frame's body. `header.doc` is the document of a document frame.
 * Returns null when the body names a union member this build does not know.
 */
export function readBody(
  d: decoding.Decoder,
  header: { type: number; flags: number; doc: DocRef | null },
  from: Sender,
): Message | null {
  const name = NAME_OF.get(header.type);
  if (name === undefined) throw bad(`unknown frame type ${header.type}`);
  const sentBy = SENT_BY[name];
  if (sentBy !== "both" && sentBy !== from)
    throw bad(`a ${from} may not send ${name}`);
  try {
    const message = readFields(d, name, header);
    if (
      message.type === "SYNC" &&
      message.step !== "step1" &&
      from !== "server"
    )
      throw bad(`a ${from} may not send SYNC ${message.step}`);
    return message;
  } catch (e) {
    if (e instanceof UnknownMember) return null;
    throw e;
  }
}

function readFields(
  d: decoding.Decoder,
  name: FrameName,
  header: { flags: number; doc: DocRef | null },
): Message {
  const doc = (): DocRef => {
    if (header.doc === null) throw bad(`${name} has no document`);
    return header.doc;
  };
  switch (name) {
    case "HELLO":
      return {
        type: "HELLO",
        versions: readVersions(d),
        build: decoding.readVarString(d),
        deviceId: decoding.readVarString(d),
      };
    case "WELCOME":
      return {
        type: "WELCOME",
        session: {
          userId: decoding.readVarString(d),
          name: decoding.readVarString(d),
        },
        limits: { frameBytes: readNumber(d), messageBytes: readNumber(d) },
        server: { current: readVersions(d), min: readVersions(d) },
      };
    case "AUTH_EXPIRING":
      return { type: "AUTH_EXPIRING", secondsLeft: readNumber(d) };
    case "AUTH_REFRESH":
      return { type: "AUTH_REFRESH", ticket: decoding.readVarString(d) };
    case "ERROR": {
      const errorDoc = header.flags & FLAG.HAS_DOC ? readDocRef(d) : null;
      return {
        type: "ERROR",
        code: readNumber(d),
        message: decoding.readVarString(d),
        retryAfterMs: readNullable(d, readNumber),
        permanent: readBoolean(d),
        doc: errorDoc,
      };
    }
    case "PING":
      return {
        type: header.flags & FLAG.PONG ? "PONG" : "PING",
        nonce: readNumber(d),
      };
    case "SUBSCRIBE":
      return {
        type: "SUBSCRIBE",
        ...doc(),
        mode: readIndex(d, MODES),
        clientIds: readArray(d, readNumber),
        lastServerSeq: readNumber(d),
      };
    case "SUBSCRIBED":
      return {
        type: "SUBSCRIBED",
        ...doc(),
        role: readIndex(d, ROLES),
        capabilities: readArray(d, () => CAPABILITIES[readUint8(d)]).filter(
          (c): c is Capability => c !== undefined,
        ),
        headSeq: readNumber(d),
        minSchema: readNumber(d),
        engineVersion: readNumber(d),
        lockLevel: readNumber(d),
        lockAnchors: readLockAnchors(d),
        revision: readNullable(d, () => ({
          setId: decoding.readVarString(d),
          baselineVersionId: decoding.readVarString(d),
        })),
        airWindow: readNullable(d, () => ({
          startsAt: readNumber(d),
          endsAt: readNumber(d),
        })),
      };
    case "GENERATION_MOVED":
      return {
        type: "GENERATION_MOVED",
        ...doc(),
        newGeneration: readNumber(d),
      };
    case "UNSUBSCRIBE":
      return { type: "UNSUBSCRIBE", ...doc() };
    case "SYNC": {
      const step = SYNC_STEPS[readNumber(d)];
      if (step === undefined) throw new UnknownMember();
      return { type: "SYNC", ...doc(), step, data: readBytes(d) };
    }
    case "PUSH":
      return {
        type: "PUSH",
        ...doc(),
        clientSeq: readNumber(d),
        update: readBytes(d),
        heal: readBoolean(d),
      };
    case "ACK":
      return {
        type: "ACK",
        ...doc(),
        clientSeq: readNumber(d),
        serverSeq: readNumber(d),
      };
    case "AWARENESS":
      return { type: "AWARENESS", ...doc(), update: readBytes(d) };
    case "CONTROL":
      return {
        type: "CONTROL",
        ...doc(),
        seq: readNumber(d),
        kind: readIndex(d, CONTROL_KINDS),
        data: readBytes(d),
      };
    case "VIEW_SNAPSHOT":
      return {
        type: "VIEW_SNAPSHOT",
        ...doc(),
        viewSeq: readNumber(d),
        content: readBytes(d),
      };
    case "VIEW_PATCH":
      return {
        type: "VIEW_PATCH",
        ...doc(),
        viewSeq: readNumber(d),
        patch: readBytes(d),
      };
  }
}

/** lib0's readUint8 returns undefined past the end; this one refuses. */
function readUint8(d: decoding.Decoder): number {
  if (d.pos >= d.arr.byteLength) throw bad("unexpected end of frame");
  return decoding.readUint8(d);
}

function readNumber(d: decoding.Decoder): number {
  const n = decoding.readVarUint(d);
  if (!Number.isSafeInteger(n)) throw bad("a number beyond the safe integers");
  return n;
}

/** Copied out, so the message never aliases the frame. */
function readBytes(d: decoding.Decoder): Uint8Array {
  return decoding.readVarUint8Array(d).slice();
}

function readBoolean(d: decoding.Decoder): boolean {
  const b = readUint8(d);
  if (b > 1) throw bad(`${b} is not a boolean`);
  return b === 1;
}

function readNullable<T>(
  d: decoding.Decoder,
  read: (d: decoding.Decoder) => T,
): T | null {
  return readBoolean(d) ? read(d) : null;
}

function readArray<T>(
  d: decoding.Decoder,
  read: (d: decoding.Decoder) => T,
): T[] {
  const count = readNumber(d);
  const items: T[] = [];
  for (let i = 0; i < count; i++) items.push(read(d));
  return items;
}

function readIndex<T>(d: decoding.Decoder, list: readonly T[]): T {
  const value = list[readUint8(d)];
  if (value === undefined) throw new UnknownMember();
  return value;
}

function readVersions(d: decoding.Decoder): VersionSet {
  return {
    protocol: readNumber(d),
    schema: readNumber(d),
    engine: readNumber(d),
    table: readNumber(d),
  };
}

function readLockAnchors(
  d: decoding.Decoder,
): { table: LockAnchor[] } | { hash: Uint8Array } | null {
  switch (readUint8(d)) {
    case 0:
      return null;
    case 1:
      return { table: readArray(d, readLockAnchor) };
    case 2:
      return { hash: readBytes(d) };
    default:
      throw new UnknownMember();
  }
}

function readLockAnchor(d: decoding.Decoder): LockAnchor {
  return {
    level: readNumber(d),
    order: readNumber(d),
    label: decoding.readVarString(d),
    blockId: decoding.readVarString(d),
    offset: readNumber(d),
    quote: decoding.readVarString(d),
    fallbackIds: readArray(d, decoding.readVarString),
  };
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
