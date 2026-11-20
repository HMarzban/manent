// What the local node tells a window of the upstream it relays a document through, as the data
// of a CONTROL frame, and the refusal of one entry it passes on.
import type { BlockJSON, MarkJSON, TextJSON } from "@manent/schema";
import type { LinkState, RecoveredItem, SideState } from "../ports/ports.ts";
import { readEvent } from "../session/doc-handle.ts";
import type { DocEvent } from "../session/doc-handle.ts";

export const UPSTREAM_STATUS_VERSION = 1;

/** Why the server refused a document's first sync: the document then stays the device's own. */
export const HANDOFF_REFUSALS = [
  "forbidden",
  "deleted",
  "exists_elsewhere",
  "invalid",
  "too_large",
] as const;
export type HandoffRefusal = (typeof HANDOFF_REFUSALS)[number];

export type UpstreamEvent = Extract<
  DocEvent,
  { type: "receipt" | "rebuilt" | "past_window" | "rejected" }
>;

/**
 * The upstream handle's facts for one document. `lastSyncedAt` is its
 * `DocMeta.lastSyncedAt`, the last time the server acknowledged;
 * `handoffRefused` is set when the first sync was refused, until the document
 * is synced; `events` are the handle's latest, `n` rising from 1 each time the
 * node starts.
 */
export interface UpstreamStatus {
  v: 1;
  link: LinkState;
  synced: boolean;
  waiting: number;
  wentOfflineAt: number | null;
  neverSynced: boolean;
  side: SideState[];
  device: "ok" | "failing";
  recovered: RecoveredItem[];
  lastSyncedAt: number | null;
  handoffRefused: HandoffRefusal | null;
  events: { n: number; event: UpstreamEvent }[];
}

type Fields = Record<string, unknown>;
type Is<T> = (value: unknown) => value is T;

const UTF8 = new TextEncoder();

function keyOf<K extends string>(table: Readonly<Record<K, true>>): Is<K> {
  return (value): value is K =>
    typeof value === "string" && Object.hasOwn(table, value);
}

const isLink = keyOf<LinkState>(
  Object.freeze({
    offline: true,
    connecting: true,
    authenticating: true,
    online: true,
  }),
);
const isSide = keyOf<SideState>(
  Object.freeze({
    access_removed: true,
    deleted: true,
    read_only: true,
    rejected: true,
    not_saved: true,
    sign_in: true,
    server_old: true,
    view_only: true,
  }),
);
const isDevice = keyOf<UpstreamStatus["device"]>(
  Object.freeze({ ok: true, failing: true }),
);
const isCause = keyOf<RecoveredItem["cause"]>(
  Object.freeze({ merge: true, rejected: true, overlap: true }),
);
const UPSTREAM_EVENT_TYPES: Readonly<Record<UpstreamEvent["type"], true>> =
  Object.freeze({
    receipt: true,
    rebuilt: true,
    past_window: true,
    rejected: true,
  });

/** One of the kinds of event the upstream status carries. */
export function isUpstreamEvent(event: DocEvent): event is UpstreamEvent {
  return Object.hasOwn(UPSTREAM_EVENT_TYPES, event.type);
}

function isRefusal(value: unknown): value is HandoffRefusal {
  return HANDOFF_REFUSALS.some((refusal) => refusal === value);
}

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
  return isNumber(value) && Number.isSafeInteger(value) && value >= 0;
}

function isListOf<T>(value: unknown, is: Is<T>): value is T[] {
  return Array.isArray(value) && Array.from(value).every((item) => is(item));
}

function isNullOr<T>(value: unknown, is: Is<T>): value is T | null {
  return value === null || is(value);
}

function isMark(value: unknown): value is MarkJSON {
  return (
    isFields(value) &&
    isString(value.type) &&
    (value.attrs === undefined || isFields(value.attrs))
  );
}

function isRun(value: unknown): value is TextJSON {
  return (
    isFields(value) &&
    value.type === "text" &&
    isString(value.text) &&
    (value.marks === undefined || isListOf(value.marks, isMark))
  );
}

/** A block's shape; what its attributes and marks hold is passed on as it is. */
function isBlock(value: unknown): value is BlockJSON {
  return (
    isFields(value) &&
    value.type === "block" &&
    (value.attrs === undefined || isFields(value.attrs)) &&
    (value.content === undefined || isListOf(value.content, isRun))
  );
}

function isItem(value: unknown): value is RecoveredItem {
  return (
    isFields(value) &&
    isString(value.id) &&
    isString(value.docId) &&
    isNullOr(value.blockId, isString) &&
    isNullOr(value.nearBlockId, isString) &&
    isString(value.text) &&
    isNumber(value.recoveredAt) &&
    isCause(value.cause) &&
    isNullOr(value.mine, isBlock) &&
    isNullOr(value.theirs, isBlock) &&
    isListOf(value.otherClientIds, isNumber)
  );
}

/** Each entry with an `n` of 1 or more and an event of a kind the status carries; null when any is not. */
function readEvents(value: unknown): UpstreamStatus["events"] | null {
  if (!Array.isArray(value)) return null;
  const entries: readonly unknown[] = value;
  const events: UpstreamStatus["events"] = [];
  for (const entry of entries) {
    if (!isFields(entry) || !isCount(entry.n) || entry.n === 0) return null;
    const event = readEvent(entry.event);
    if (event === null || !isUpstreamEvent(event)) return null;
    events.push({ n: entry.n, event });
  }
  return events;
}

function parseJson(data: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  } catch {
    // bytes that are not UTF-8 JSON hold no status: null reads as none
    return null;
  }
}

/** UTF-8 JSON, its keys in the order of `UpstreamStatus`. */
export function encodeUpstreamStatus(status: UpstreamStatus): Uint8Array {
  const { v, link, synced, waiting, wentOfflineAt, neverSynced } = status;
  const { side, device, recovered, lastSyncedAt, handoffRefused } = status;
  const events = status.events.map(({ n, event }) => ({ n, event }));
  return UTF8.encode(
    JSON.stringify({
      v,
      link,
      synced,
      waiting,
      wentOfflineAt,
      neverSynced,
      side,
      device,
      recovered,
      lastSyncedAt,
      handoffRefused,
      events,
    }),
  );
}

/** Null for bytes that are not a status of this version; keys it does not know are ignored. */
export function decodeUpstreamStatus(data: Uint8Array): UpstreamStatus | null {
  const value = parseJson(data);
  if (!isFields(value) || value.v !== UPSTREAM_STATUS_VERSION) return null;
  const { link, synced, waiting, wentOfflineAt, neverSynced, side } = value;
  const { device, recovered, lastSyncedAt, handoffRefused } = value;
  const events = readEvents(value.events);
  const valid =
    isLink(link) &&
    typeof synced === "boolean" &&
    isCount(waiting) &&
    isNullOr(wentOfflineAt, isNumber) &&
    typeof neverSynced === "boolean" &&
    isListOf(side, isSide) &&
    isDevice(device) &&
    isListOf(recovered, isItem) &&
    isNullOr(lastSyncedAt, isNumber) &&
    isNullOr(handoffRefused, isRefusal) &&
    events !== null;
  if (!valid) return null;
  return {
    v: UPSTREAM_STATUS_VERSION,
    link,
    synced,
    waiting,
    wentOfflineAt,
    neverSynced,
    side,
    device,
    recovered,
    lastSyncedAt,
    handoffRefused,
    events,
  };
}

/** The data of a CONTROL `upstream_refused`: the entry the server refused upstream, and its message. */
export function encodeUpstreamRefused(
  clientSeq: number,
  message: string,
): Uint8Array {
  return UTF8.encode(JSON.stringify({ clientSeq, message }));
}
