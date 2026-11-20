// The messages one user's tabs exchange, and the reader that accepts only what this build knows.
import { TAB_PROTOCOL_VERSION } from "../ports/defaults.ts";
import type {
  DocMeta,
  DocStatus,
  DocSyncState,
  LinkState,
  RecoveredItem,
  SideState,
} from "../ports/ports.ts";

/**
 * What one tab tells another. `who` asks who leads; `leader` answers it, and is
 * posted on election. A follower opens and closes a document through the leader
 * (`clientId` is its Yjs client ID) and posts its `n`-th local update of a
 * document, counting from 1; `saved` says every edit of that tab up to `n` is in
 * the local store, or that the store refused it. `to` is the one tab a message is
 * for; `remote` is an update already stored; `aw` is awareness, passed through.
 */
export type TabBody =
  | { t: "who" }
  | { t: "leader" }
  | {
      t: "open";
      docId: string;
      clientId: number;
      create: { kind: string; home: string } | null;
    }
  | { t: "close"; docId: string }
  | { t: "state"; to: string; docId: string; state: Uint8Array; meta: DocMeta }
  | {
      t: "edit";
      docId: string;
      n: number;
      update: Uint8Array;
      elements: string[];
    }
  | { t: "saved"; to: string; docId: string; n: number; refused: boolean }
  | { t: "remote"; docId: string; update: Uint8Array }
  | { t: "status"; docId: string; status: DocStatus }
  | { t: "event"; docId: string; event: unknown }
  | { t: "recovered"; docId: string; items: RecoveredItem[] }
  | { t: "replace"; docId: string; state: Uint8Array }
  | { t: "aw"; docId: string; update: Uint8Array };

/** `from` is the sending tab's ID. */
export type TabMessage = TabBody & { v: 1; from: string };

export function tabMessage(from: string, body: TabBody): TabMessage {
  return { v: TAB_PROTOCOL_VERSION, from, ...body };
}

type Fields = Record<string, unknown>;
type Read<T> = (value: unknown) => T;

/** Thrown by a reader below and caught only by `readTabMessage`. */
class Malformed extends Error {}

/** A plain object: bytes, a list, a map or a date is not one, though `typeof` says so. */
function isObject(value: unknown): value is Fields {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isKey<K extends string>(
  table: Readonly<Record<K, unknown>>,
  value: unknown,
): value is K {
  return typeof value === "string" && Object.hasOwn(table, value);
}

function readFields(value: unknown): Fields {
  if (!isObject(value)) throw new Malformed();
  return value;
}

function readString(value: unknown): string {
  if (typeof value !== "string") throw new Malformed();
  return value;
}

function readNumber(value: unknown): number {
  if (typeof value !== "number") throw new Malformed();
  return value;
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Malformed();
  return value;
}

function readBytes(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Malformed();
  return value;
}

function listOf<T>(read: Read<T>): Read<T[]> {
  return (value) => {
    if (!Array.isArray(value)) throw new Malformed();
    // Unlike map, this visits a hole as undefined, so a sparse list is refused.
    return Array.from(value, (item) => read(item));
  };
}

function orNull<T>(read: Read<T>): Read<T | null> {
  return (value) => (value === null ? null : read(value));
}

function oneOf<K extends string>(table: Readonly<Record<K, true>>): Read<K> {
  return (value) => {
    if (!isKey(table, value)) throw new Malformed();
    return value;
  };
}

type ParkedReason = NonNullable<DocMeta["parked"]>["reason"];

const readLink = oneOf<LinkState>(
  Object.freeze({
    offline: true,
    connecting: true,
    authenticating: true,
    online: true,
  }),
);
const readDocSync = oneOf<DocSyncState>(
  Object.freeze({ local: true, syncing: true, synced: true }),
);
const readSide = oneOf<SideState>(
  Object.freeze({
    access_removed: true,
    deleted: true,
    read_only: true,
    rejected: true,
    not_saved: true,
    sign_in: true,
    server_old: true,
  }),
);
const readParkedReason = oneOf<ParkedReason>(
  Object.freeze({ access_removed: true, deleted: true }),
);
const readCause = oneOf<RecoveredItem["cause"]>(
  Object.freeze({ merge: true, rejected: true, overlap: true }),
);

function readCreate(value: unknown): NonNullable<DocMeta["create"]> {
  const fields = readFields(value);
  return { kind: readString(fields.kind), home: readString(fields.home) };
}

function readParked(value: unknown): NonNullable<DocMeta["parked"]> {
  const fields = readFields(value);
  return {
    reason: readParkedReason(fields.reason),
    parkedAt: readNumber(fields.parkedAt),
  };
}

// a tab of a build from before moves sends no `replaying` and no `moving`
function readRecovering(value: unknown): NonNullable<DocMeta["recovering"]> {
  const fields = readFields(value);
  return {
    versionId: readString(fields.versionId),
    heal: readBoolean(fields.heal),
    replaying:
      fields.replaying === undefined ? false : readBoolean(fields.replaying),
  };
}

function readMoving(value: unknown): DocMeta["moving"] {
  if (value === undefined || value === null) return null;
  const fields = readFields(value);
  return {
    from: readNumber(fields.from),
    to: readNumber(fields.to),
    key: orNull(readString)(fields.key),
    throughLocalSeq: readNumber(fields.throughLocalSeq),
  };
}

function readClocks(value: unknown): Record<string, number> {
  const entries = Object.entries(readFields(value));
  return Object.fromEntries(
    entries.map(([id, clock]) => [id, readNumber(clock)]),
  );
}

function readMeta(value: unknown): DocMeta {
  const fields = readFields(value);
  return {
    docId: readString(fields.docId),
    generation: readNumber(fields.generation),
    lastServerSeq: readNumber(fields.lastServerSeq),
    clientIds: listOf(readNumber)(fields.clientIds),
    ackedClocks: readClocks(fields.ackedClocks),
    neverSynced: readBoolean(fields.neverSynced),
    create: orNull(readCreate)(fields.create),
    parked: orNull(readParked)(fields.parked),
    recovering: orNull(readRecovering)(fields.recovering),
    lastDeviceVersionAt: readNumber(fields.lastDeviceVersionAt),
    lastSyncedAt: orNull(readNumber)(fields.lastSyncedAt),
    moving: readMoving(fields.moving),
  };
}

function readStatus(value: unknown): DocStatus {
  const fields = readFields(value);
  return {
    saved: readBoolean(fields.saved),
    synced: readBoolean(fields.synced),
    waiting: readNumber(fields.waiting),
    link: readLink(fields.link),
    docSync: readDocSync(fields.docSync),
    wentOfflineAt: orNull(readNumber)(fields.wentOfflineAt),
    neverSynced: readBoolean(fields.neverSynced),
    recovered: readNumber(fields.recovered),
    side: listOf(readSide)(fields.side),
  };
}

function readItem(value: unknown): RecoveredItem {
  const fields = readFields(value);
  return {
    id: readString(fields.id),
    docId: readString(fields.docId),
    blockId: orNull(readString)(fields.blockId),
    nearBlockId: orNull(readString)(fields.nearBlockId),
    text: readString(fields.text),
    recoveredAt: readNumber(fields.recoveredAt),
    cause: readCause(fields.cause),
  };
}

type Bodies = {
  readonly [T in TabBody["t"]]: (fields: Fields) => Extract<TabBody, { t: T }>;
};

const BODIES = Object.freeze<Bodies>({
  who: () => ({ t: "who" }),
  leader: () => ({ t: "leader" }),
  open: (f) => ({
    t: "open",
    docId: readString(f.docId),
    clientId: readNumber(f.clientId),
    create: orNull(readCreate)(f.create),
  }),
  close: (f) => ({ t: "close", docId: readString(f.docId) }),
  state: (f) => ({
    t: "state",
    to: readString(f.to),
    docId: readString(f.docId),
    state: readBytes(f.state),
    meta: readMeta(f.meta),
  }),
  edit: (f) => ({
    t: "edit",
    docId: readString(f.docId),
    n: readNumber(f.n),
    update: readBytes(f.update),
    elements: listOf(readString)(f.elements),
  }),
  saved: (f) => ({
    t: "saved",
    to: readString(f.to),
    docId: readString(f.docId),
    n: readNumber(f.n),
    refused: readBoolean(f.refused),
  }),
  remote: (f) => ({
    t: "remote",
    docId: readString(f.docId),
    update: readBytes(f.update),
  }),
  status: (f) => ({
    t: "status",
    docId: readString(f.docId),
    status: readStatus(f.status),
  }),
  event: (f) => ({ t: "event", docId: readString(f.docId), event: f.event }),
  recovered: (f) => ({
    t: "recovered",
    docId: readString(f.docId),
    items: listOf(readItem)(f.items),
  }),
  replace: (f) => ({
    t: "replace",
    docId: readString(f.docId),
    state: readBytes(f.state),
  }),
  aw: (f) => ({
    t: "aw",
    docId: readString(f.docId),
    update: readBytes(f.update),
  }),
});

/**
 * Null for anything but an object of this version and a known `t` whose fields
 * all have their type. The result is a new object of the known keys only, so a
 * newer tab may add a key without breaking this one.
 */
export function readTabMessage(value: unknown): TabMessage | null {
  if (!isObject(value) || value.v !== TAB_PROTOCOL_VERSION) return null;
  if (typeof value.from !== "string" || !isKey(BODIES, value.t)) return null;
  try {
    return {
      v: TAB_PROTOCOL_VERSION,
      from: value.from,
      ...BODIES[value.t](value),
    };
  } catch (error) {
    if (error instanceof Malformed) return null;
    throw error;
  }
}
