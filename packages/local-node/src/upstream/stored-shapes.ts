// The checks of what an upstream outbox file holds as JSON, before anything trusts its type.
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
  StoredRecoveredItem,
} from "@manent/sync-client";

type Fields = Record<string, unknown>;
type Is<T> = (value: unknown) => value is T;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isFlag = (value: unknown): value is boolean => typeof value === "boolean";

function isNullOr<T>(is: Is<T>): Is<T | null> {
  return (value): value is T | null => value === null || is(value);
}

function isListOf<T>(is: Is<T>): Is<T[]> {
  return (value): value is T[] => Array.isArray(value) && value.every(is);
}

function isOneOf<T extends string>(values: readonly T[]): Is<T> {
  return (value): value is T => values.some((v) => v === value);
}

/** Every key of `checks` holds a value that passes its check; other keys are not allowed. */
function hasFields(
  value: unknown,
  checks: Readonly<Record<string, Is<unknown>>>,
): value is Fields {
  if (!isFields(value)) return false;
  const keys = Object.keys(value);
  const known = Object.keys(checks);
  if (keys.some((key) => !known.includes(key))) return false;
  return known.every((key) => checks[key]?.(value[key]) === true);
}

const isClocks = (value: unknown): value is Record<string, number> =>
  isFields(value) && Object.values(value).every(isNumber);

const isCreate = isNullOr((value): value is NonNullable<DocMeta["create"]> =>
  hasFields(value, {
    kind: isText,
    home: isText,
    workspaceId: isNullOr(isText),
  }),
);
const isParked = isNullOr((value): value is NonNullable<DocMeta["parked"]> =>
  hasFields(value, {
    reason: isOneOf(["access_removed", "deleted"]),
    parkedAt: isNumber,
  }),
);
const isRecovering = isNullOr(
  (value): value is NonNullable<DocMeta["recovering"]> =>
    hasFields(value, { versionId: isText, heal: isFlag, replaying: isFlag }),
);
const isMoving = isNullOr((value): value is NonNullable<DocMeta["moving"]> =>
  hasFields(value, {
    from: isNumber,
    to: isNumber,
    key: isNullOr(isText),
    throughLocalSeq: isNumber,
  }),
);

const isMeta = (value: unknown): value is DocMeta =>
  hasFields(value, {
    docId: isText,
    generation: isNumber,
    lastServerSeq: isNumber,
    clientIds: isListOf(isNumber),
    ackedClocks: isClocks,
    neverSynced: isFlag,
    create: isCreate,
    parked: isParked,
    recovering: isRecovering,
    lastDeviceVersionAt: isNumber,
    lastSyncedAt: isNullOr(isNumber),
    moving: isMoving,
  });

const isMark = (value: unknown): value is MarkJSON =>
  isFields(value) &&
  isText(value.type) &&
  (value.attrs === undefined || isFields(value.attrs));

const isRun = (value: unknown): value is TextJSON =>
  isFields(value) &&
  value.type === "text" &&
  isText(value.text) &&
  (value.marks === undefined || isListOf(isMark)(value.marks));

const isBlock = (value: unknown): value is BlockJSON =>
  isFields(value) &&
  value.type === "block" &&
  (value.attrs === undefined || isFields(value.attrs)) &&
  (value.content === undefined || isListOf(isRun)(value.content));

const isSection = (value: unknown): value is SectionJSON =>
  isFields(value) &&
  value.type === "section" &&
  (value.content === undefined || isListOf(isBlock)(value.content));

const isDoc = (value: unknown): value is DocJSON =>
  isFields(value) &&
  value.type === "doc" &&
  (value.content === undefined || isListOf(isSection)(value.content));

const isStoredVersion = (
  value: unknown,
): value is Omit<DeviceVersion, "uploaded"> =>
  hasFields(value, {
    id: isText,
    docId: isText,
    kind: isOneOf(["device", "recovered"]),
    label: isOneOf([
      "session_end",
      "hourly",
      "before_reconnect",
      "manual",
      "rejected",
      "past_window",
    ]),
    createdAt: isNumber,
    content: isDoc,
  });

const isItem = (value: unknown): value is StoredRecoveredItem =>
  isFields(value) &&
  isText(value.id) &&
  isText(value.docId) &&
  isNullOr(isText)(value.blockId) &&
  isNullOr(isText)(value.nearBlockId) &&
  isText(value.text) &&
  isNumber(value.recoveredAt) &&
  isOneOf(["merge", "rejected", "overlap"])(value.cause) &&
  [value.mine, value.theirs].every(
    (block) => block === undefined || isNullOr(isBlock)(block),
  ) &&
  (value.otherClientIds === undefined ||
    isListOf(isNumber)(value.otherClientIds));

/** The value of stored JSON text that `is` accepts; TypeError for a file this driver did not write. */
function readStored<T>(text: string, is: Is<T>, what: string): T {
  const value: unknown = JSON.parse(text);
  if (!is(value))
    throw new TypeError(`an outbox file holds a ${what} it cannot read`);
  return value;
}

export const readMeta = (text: string): DocMeta =>
  readStored(text, isMeta, "document meta");

export const readVersion = (
  text: string,
  uploaded: boolean,
): DeviceVersion => ({
  ...readStored(text, isStoredVersion, "device version"),
  uploaded,
});

export const readRecovered = (text: string): StoredRecoveredItem =>
  readStored(text, isItem, "recovered item");
