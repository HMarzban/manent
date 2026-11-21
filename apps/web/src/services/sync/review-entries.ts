// To review's entries as the private index keeps them: each value's shape checked, one passage listed once, and the
// entry a stored item becomes.
import type { BlockJSON } from "@manent/schema";
import type { RecoveredItem } from "@manent/sync-client";
import { isFields } from "./device-memory.ts";

export type ReviewEntry =
  | {
      kind: "overlap";
      docId: string;
      blockId: string;
      mine: BlockJSON;
      theirs: BlockJSON;
      otherUserIds: string[];
      at: number;
      settled: boolean;
      before: BlockJSON | null;
    }
  | {
      kind: "recovered";
      docId: string;
      blockId: string | null;
      nearBlockId: string | null;
      text: string;
      at: number;
      settled: boolean;
      before: BlockJSON | null;
    };

export type Listed = ReviewEntry & { id: string };

type Fields = Readonly<Record<string, unknown>>;

/** A block as the script stores it: a `block` node with an id. */
function isBlock(value: unknown): value is BlockJSON {
  return (
    isFields(value) &&
    value.type === "block" &&
    isFields(value.attrs) &&
    typeof value.attrs.id === "string"
  );
}

const isOptionalId = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

/** The fields both kinds hold; null when one is refused. */
function readCommon(
  value: Fields,
): Pick<ReviewEntry, "docId" | "at" | "settled" | "before"> | null {
  const { docId, at, settled, before } = value;
  if (typeof docId !== "string" || typeof settled !== "boolean") return null;
  if (typeof at !== "number" || !Number.isSafeInteger(at)) return null;
  return before === null || isBlock(before)
    ? { docId, at, settled, before }
    : null;
}

const isIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === "string");

/** The entry `value` holds; null for one whose shape is refused, which stays in the map. */
export function readEntry(value: unknown): ReviewEntry | null {
  const common = isFields(value) ? readCommon(value) : null;
  if (!isFields(value) || common === null) return null;
  const { kind, blockId } = value;
  if (kind === "overlap") {
    const { mine, theirs, otherUserIds } = value;
    if (typeof blockId !== "string" || !isBlock(mine) || !isBlock(theirs))
      return null;
    if (!isIds(otherUserIds)) return null;
    return { kind, blockId, mine, theirs, otherUserIds, ...common };
  }
  const { nearBlockId, text } = value;
  if (kind !== "recovered" || typeof text !== "string") return null;
  if (!isOptionalId(blockId) || !isOptionalId(nearBlockId)) return null;
  return { kind, blockId, nearBlockId, text, ...common };
}

/** The entry an item filed on the device becomes; `otherUserIds` are the other people who wrote its passage. */
export function entryOf(
  item: RecoveredItem,
  otherUserIds: readonly string[],
): ReviewEntry {
  const common = {
    docId: item.docId,
    at: item.recoveredAt,
    settled: false,
    before: null,
  };
  if (item.cause === "overlap" && item.mine !== null && item.theirs !== null)
    return {
      kind: "overlap",
      blockId: item.blockId ?? String(item.mine.attrs?.id),
      mine: item.mine,
      theirs: item.theirs,
      otherUserIds: [...otherUserIds],
      ...common,
    };
  return {
    kind: "recovered",
    blockId: item.blockId,
    nearBlockId: item.nearBlockId,
    text: item.text,
    ...common,
  };
}

/** The open overlaps of `docId` for `blockId`, the one listed first: the newest, a tie to the larger id. */
export function openOverlaps(
  all: readonly Listed[],
  docId: string,
  blockId: string,
): Listed[] {
  return all
    .filter(
      (e) =>
        e.kind === "overlap" &&
        !e.settled &&
        e.docId === docId &&
        e.blockId === blockId,
    )
    .toSorted((a, b) => b.at - a.at || b.id.localeCompare(a.id));
}

/** The open entries of `docId`, one per passage, in the order of `order` (block ids in document order); the rest last, by time. */
export function listOpen(
  all: readonly Listed[],
  docId: string,
  order: readonly string[],
): Listed[] {
  const open = all.filter((e) => e.docId === docId && !e.settled);
  const shown = open.filter(
    (e) =>
      e.kind === "recovered" ||
      openOverlaps(open, docId, e.blockId)[0]?.id === e.id,
  );
  const place = (e: Listed): number => {
    const id =
      e.kind === "recovered" ? (e.nearBlockId ?? e.blockId) : e.blockId;
    const at = id === null ? -1 : order.indexOf(id);
    return at === -1 ? order.length : at;
  };
  return shown.toSorted((a, b) => place(a) - place(b) || a.at - b.at);
}
