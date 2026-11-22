// The readers of what an upstream outbox file holds as JSON: each builds its declared type field by
// field, so a field added to that type fails typecheck here until it is read.
import type {
  BlockJSON,
  DocJSON,
  MarkJSON,
  SectionJSON,
  TextJSON,
} from "@manent/schema";
import type {
  DeviceVersion,
  DocMeta,
  RecoveredItem,
} from "@manent/sync-client";
import { isFields } from "./cloud-requests.ts";
import type { Fields } from "./cloud-requests.ts";

type Read<T> = (value: unknown) => T;

/** Thrown by a reader below and caught only by `readStored`. */
class Malformed extends Error {}

function readFields(value: unknown): Fields {
  if (!isFields(value)) throw new Malformed();
  return value;
}

function readString(value: unknown): string {
  if (typeof value !== "string") throw new Malformed();
  return value;
}

function readNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Malformed();
  return value;
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Malformed();
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

function isKey<K extends string>(
  table: Readonly<Record<K, true>>,
  value: unknown,
): value is K {
  return typeof value === "string" && Object.hasOwn(table, value);
}

function oneOf<K extends string>(table: Readonly<Record<K, true>>): Read<K> {
  return (value) => {
    if (!isKey(table, value)) throw new Malformed();
    return value;
  };
}

const readParkedReason = oneOf<NonNullable<DocMeta["parked"]>["reason"]>(
  Object.freeze({ access_removed: true, deleted: true }),
);
const readVersionKind = oneOf<DeviceVersion["kind"]>(
  Object.freeze({ device: true, recovered: true }),
);
const readVersionLabel = oneOf<DeviceVersion["label"]>(
  Object.freeze({
    session_end: true,
    hourly: true,
    before_reconnect: true,
    manual: true,
    rejected: true,
    past_window: true,
    named: true,
    before_restore: true,
  }),
);
const readCause = oneOf<RecoveredItem["cause"]>(
  Object.freeze({ merge: true, rejected: true, overlap: true }),
);

function readClocks(value: unknown): Record<string, number> {
  const entries = Object.entries(readFields(value));
  return Object.fromEntries(
    entries.map(([id, clock]) => [id, readNumber(clock)]),
  );
}

function readCreate(value: unknown): NonNullable<DocMeta["create"]> {
  const fields = readFields(value);
  return {
    kind: readString(fields.kind),
    home: readString(fields.home),
    workspaceId: orNull(readString)(fields.workspaceId),
  };
}

function readParked(value: unknown): NonNullable<DocMeta["parked"]> {
  const fields = readFields(value);
  return {
    reason: readParkedReason(fields.reason),
    parkedAt: readNumber(fields.parkedAt),
  };
}

function readRecovering(value: unknown): NonNullable<DocMeta["recovering"]> {
  const fields = readFields(value);
  return {
    versionId: readString(fields.versionId),
    heal: readBoolean(fields.heal),
    replaying: readBoolean(fields.replaying),
  };
}

function readMoving(value: unknown): NonNullable<DocMeta["moving"]> {
  const fields = readFields(value);
  return {
    from: readNumber(fields.from),
    to: readNumber(fields.to),
    key: orNull(readString)(fields.key),
    throughLocalSeq: readNumber(fields.throughLocalSeq),
  };
}

function readDocMeta(value: unknown): DocMeta {
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
    moving: orNull(readMoving)(fields.moving),
  };
}

function readMark(value: unknown): MarkJSON {
  const fields = readFields(value);
  const mark: MarkJSON = { type: readString(fields.type) };
  if (fields.attrs !== undefined) mark.attrs = readFields(fields.attrs);
  return mark;
}

function readRun(value: unknown): TextJSON {
  const fields = readFields(value);
  if (fields.type !== "text") throw new Malformed();
  const run: TextJSON = { type: "text", text: readString(fields.text) };
  if (fields.marks !== undefined) run.marks = listOf(readMark)(fields.marks);
  return run;
}

/** A block's shape; what its attributes and marks hold is passed on as it is. */
function readBlock(value: unknown): BlockJSON {
  const fields = readFields(value);
  if (fields.type !== "block") throw new Malformed();
  const block: BlockJSON = { type: "block" };
  if (fields.attrs !== undefined) block.attrs = readFields(fields.attrs);
  if (fields.content !== undefined)
    block.content = listOf(readRun)(fields.content);
  return block;
}

function readSection(value: unknown): SectionJSON {
  const fields = readFields(value);
  if (fields.type !== "section") throw new Malformed();
  const section: SectionJSON = { type: "section" };
  if (fields.content !== undefined)
    section.content = listOf(readBlock)(fields.content);
  return section;
}

function readDoc(value: unknown): DocJSON {
  const fields = readFields(value);
  if (fields.type !== "doc") throw new Malformed();
  const doc: DocJSON = { type: "doc" };
  if (fields.content !== undefined)
    doc.content = listOf(readSection)(fields.content);
  return doc;
}

/** The value of stored JSON text that `read` builds; TypeError for a file this driver did not write. */
function readStored<T>(text: string, read: Read<T>, what: string): T {
  const value: unknown = JSON.parse(text);
  try {
    return read(value);
  } catch (cause) {
    if (!(cause instanceof Malformed)) throw cause;
    throw new TypeError(`an outbox file holds a ${what} it cannot read`, {
      cause,
    });
  }
}

export const readMeta = (text: string): DocMeta =>
  readStored(text, readDocMeta, "document meta");

/** `uploaded` is kept in its own column, so the stored text lacks it. */
export const readVersion = (text: string, uploaded: boolean): DeviceVersion =>
  readStored(
    text,
    (value): DeviceVersion => {
      const fields = readFields(value);
      const { name } = fields;
      return {
        id: readString(fields.id),
        docId: readString(fields.docId),
        kind: readVersionKind(fields.kind),
        label: readVersionLabel(fields.label),
        name: name === undefined ? null : orNull(readString)(name),
        createdAt: readNumber(fields.createdAt),
        content: readDoc(fields.content),
        uploaded,
      };
    },
    "device version",
  );

/** An item stored before overlaps carried wordings lacks them: null, null and []. */
export const readRecovered = (text: string): RecoveredItem =>
  readStored(
    text,
    (value): RecoveredItem => {
      const fields = readFields(value);
      const { mine, theirs, otherClientIds } = fields;
      return {
        id: readString(fields.id),
        docId: readString(fields.docId),
        blockId: orNull(readString)(fields.blockId),
        nearBlockId: orNull(readString)(fields.nearBlockId),
        text: readString(fields.text),
        recoveredAt: readNumber(fields.recoveredAt),
        cause: readCause(fields.cause),
        mine: mine === undefined ? null : orNull(readBlock)(mine),
        theirs: theirs === undefined ? null : orNull(readBlock)(theirs),
        otherClientIds:
          otherClientIds === undefined
            ? []
            : listOf(readNumber)(otherClientIds),
      };
    },
    "recovered item",
  );
