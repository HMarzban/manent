// The fields of each message's body. A union member travels as its index: one byte, except the
// SYNC step, which is a varuint. An unknown capability is dropped from its list; an unknown role,
// mode, step, kind, lock source or lock-anchor tag skips the frame.
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { FLAG } from "./frame.ts";
import type { FrameHeader, FrameName } from "./frame.ts";
import {
  CAPABILITIES,
  CONTROL_KINDS,
  DOC_ROLES,
  LOCK_SOURCES,
  SUBSCRIBE_MODES,
  SYNC_STEPS,
} from "./messages.ts";
import type {
  Capability,
  DocRef,
  LockAnchorRecord,
  Message,
} from "./messages.ts";
import {
  UnknownMember,
  bad,
  indexOf,
  readArray,
  readBoolean,
  readBytes,
  readDocRef,
  readIndex,
  readNullable,
  readNumber,
  readStruct,
  readUint8,
  readVersions,
  writeArray,
  writeBoolean,
  writeDocRef,
  writeIndex,
  writeNullable,
  writeNumber,
  writeString,
  writeStruct,
  writeVersions,
} from "./wire.ts";

export function writeBody(e: encoding.Encoder, m: Message): void {
  switch (m.type) {
    case "HELLO":
      writeVersions(e, m.versions);
      writeString(e, m.build);
      writeString(e, m.deviceId);
      return;
    case "WELCOME":
      writeStruct(e, (fields) => {
        writeString(fields, m.session.userId);
        writeString(fields, m.session.name);
      });
      writeStruct(e, (fields) => {
        writeNumber(fields, m.limits.frameBytes);
        writeNumber(fields, m.limits.messageBytes);
      });
      writeVersions(e, m.server.current);
      writeVersions(e, m.server.min);
      return;
    case "AUTH_EXPIRING":
      writeNumber(e, m.expiresInMs);
      return;
    case "AUTH_REFRESH":
      writeString(e, m.ticket);
      return;
    case "ERROR":
      if (m.doc) writeDocRef(e, m.doc);
      writeNumber(e, m.code);
      writeString(e, m.message);
      writeNullable(e, m.retryAfterMs, writeNumber);
      writeBoolean(e, m.permanent);
      writeNullable(e, m.clientSeq, writeNumber);
      return;
    case "PING":
    case "PONG":
      writeNumber(e, m.nonce);
      return;
    case "SUBSCRIBE":
      writeIndex(e, SUBSCRIBE_MODES, m.mode);
      writeArray(e, m.clientIds, writeNumber);
      writeNumber(e, m.lastServerSeq);
      return;
    case "SUBSCRIBED":
      writeIndex(e, DOC_ROLES, m.role);
      writeArray(e, m.capabilities, (enc, c) =>
        writeIndex(enc, CAPABILITIES, c),
      );
      writeNumber(e, m.headSeq);
      writeNumber(e, m.minSchemaVersion);
      writeNumber(e, m.engineVersion);
      writeNumber(e, m.lockLevel);
      if (m.lockAnchors === null) encoding.writeUint8(e, 0);
      else if ("table" in m.lockAnchors) {
        encoding.writeUint8(e, 1);
        writeArray(e, m.lockAnchors.table, writeLockAnchorRecord);
      } else {
        encoding.writeUint8(e, 2);
        encoding.writeVarUint8Array(e, m.lockAnchors.hash);
      }
      writeNullable(e, m.revision, (enc, r) =>
        writeStruct(enc, (fields) => {
          writeString(fields, r.setId);
          writeString(fields, r.baselineVersionId);
        }),
      );
      writeNullable(e, m.airWindow, (enc, w) =>
        writeStruct(enc, (fields) => {
          writeNumber(fields, w.startsAt);
          writeNumber(fields, w.endsAt);
        }),
      );
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
    case "SET":
      writeNumber(e, m.clientSeq);
      writeString(e, m.key);
      encoding.writeVarUint8Array(e, m.value);
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
    default:
      m satisfies never;
  }
}

function writeLockAnchorRecord(e: encoding.Encoder, a: LockAnchorRecord): void {
  writeStruct(e, (fields) => {
    writeNumber(fields, a.level);
    writeNumber(fields, a.order);
    writeString(fields, a.label);
    writeString(fields, a.blockId);
    writeNumber(fields, a.offset);
    writeString(fields, a.quote);
    writeArray(fields, a.fallbackIds, writeString);
    writeIndex(fields, LOCK_SOURCES, a.source);
  });
}

/**
 * The message in the body of a frame whose type is `name`. Throws `UnknownMember` when the body
 * names a union member this build does not know.
 */
export function readBody(
  d: decoding.Decoder,
  name: FrameName,
  header: FrameHeader,
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
        session: readStruct(d, (fields) => ({
          userId: decoding.readVarString(fields),
          name: decoding.readVarString(fields),
        })),
        limits: readStruct(d, (fields) => ({
          frameBytes: readNumber(fields),
          messageBytes: readNumber(fields),
        })),
        server: { current: readVersions(d), min: readVersions(d) },
      };
    case "AUTH_EXPIRING":
      return { type: "AUTH_EXPIRING", expiresInMs: readNumber(d) };
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
        clientSeq: readNullable(d, readNumber),
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
        mode: readIndex(d, SUBSCRIBE_MODES),
        clientIds: readArray(d, readNumber),
        lastServerSeq: readNumber(d),
      };
    case "SUBSCRIBED":
      return {
        type: "SUBSCRIBED",
        ...doc(),
        role: readIndex(d, DOC_ROLES),
        capabilities: readArray(d, () => CAPABILITIES[readUint8(d)]).filter(
          (c): c is Capability => c !== undefined,
        ),
        headSeq: readNumber(d),
        minSchemaVersion: readNumber(d),
        engineVersion: readNumber(d),
        lockLevel: readNumber(d),
        lockAnchors: readLockAnchors(d),
        revision: readNullable(d, () =>
          readStruct(d, (fields) => ({
            setId: decoding.readVarString(fields),
            baselineVersionId: decoding.readVarString(fields),
          })),
        ),
        airWindow: readNullable(d, () =>
          readStruct(d, (fields) => ({
            startsAt: readNumber(fields),
            endsAt: readNumber(fields),
          })),
        ),
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
    case "SET":
      return {
        type: "SET",
        ...doc(),
        clientSeq: readNumber(d),
        key: decoding.readVarString(d),
        value: readBytes(d),
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

function readLockAnchors(
  d: decoding.Decoder,
): { table: LockAnchorRecord[] } | { hash: Uint8Array } | null {
  switch (readUint8(d)) {
    case 0:
      return null;
    case 1:
      return { table: readArray(d, readLockAnchorRecord) };
    case 2:
      return { hash: readBytes(d) };
    default:
      throw new UnknownMember();
  }
}

function readLockAnchorRecord(d: decoding.Decoder): LockAnchorRecord {
  return readStruct(d, (fields) => ({
    level: readNumber(fields),
    order: readNumber(fields),
    label: decoding.readVarString(fields),
    blockId: decoding.readVarString(fields),
    offset: readNumber(fields),
    quote: decoding.readVarString(fields),
    fallbackIds: readArray(fields, decoding.readVarString),
    source: readIndex(fields, LOCK_SOURCES),
  }));
}
