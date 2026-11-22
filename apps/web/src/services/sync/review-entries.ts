// To review's entries as the private index keeps them: each value's shape checked, one passage listed once, and the
// entry a stored item becomes.
import type { JsonMapView } from "@manent/crdt";
import { rejects, validateBlocks } from "@manent/schema";
import type { BlockContext, BlockJSON } from "@manent/schema";
import type { RecoveredItem } from "@manent/sync-client";
import { isFields } from "./device-memory.ts";

/** Stored with its fields in this order; `nearBlockId`, then `copyId`, last of an overlap, were added after the others. */
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
      /** The block before this one when a tab last saw both: where a gone block goes back; null: the start. */
      nearBlockId: string | null;
      /** A copy of the block the server found and kept in the script, which choosing a wording deletes; null on any other overlap. */
      copyId: string | null;
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

// each wording is checked alone: mine and theirs share their block's id
const ALONE: BlockContext = Object.freeze({ isIdTaken: () => false });

/** A block the script can hold, whose id is `blockId`. */
function isBlockOf(value: unknown, blockId: string): value is BlockJSON {
  return (
    isFields(value) &&
    isFields(value.attrs) &&
    value.attrs.id === blockId &&
    !rejects(validateBlocks([value], ALONE))
  );
}

/** The block as the settling action found it: none, or the entry's own block. */
const isBefore = (
  value: unknown,
  blockId: string | null,
): value is BlockJSON | null =>
  value === null || (blockId !== null && isBlockOf(value, blockId));

const isOptionalId = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === "string");

interface Common {
  docId: string;
  at: number;
  settled: boolean;
}

function readCommon(value: Fields): Common | null {
  const { docId, at, settled } = value;
  if (typeof docId !== "string" || typeof settled !== "boolean") return null;
  if (typeof at !== "number" || !Number.isSafeInteger(at)) return null;
  return { docId, at, settled };
}

function readOverlap(value: Fields, common: Common): ReviewEntry | null {
  const { blockId, mine, theirs, otherUserIds, before } = value;
  // an entry written before overlaps kept their anchor, or their copy, has none
  const nearBlockId = value.nearBlockId ?? null;
  const copyId = value.copyId ?? null;
  if (typeof blockId !== "string" || !isIds(otherUserIds)) return null;
  if (!isBlockOf(mine, blockId) || !isBlockOf(theirs, blockId)) return null;
  if (!isBefore(before, blockId) || !isOptionalId(nearBlockId)) return null;
  if (!isOptionalId(copyId)) return null;
  const { docId, at, settled } = common;
  return {
    kind: "overlap",
    docId,
    blockId,
    mine,
    theirs,
    otherUserIds,
    at,
    settled,
    before,
    nearBlockId,
    copyId,
  };
}

function readRecovered(value: Fields, common: Common): ReviewEntry | null {
  const { blockId, nearBlockId, text, before } = value;
  if (typeof text !== "string" || !isOptionalId(nearBlockId)) return null;
  if (!isOptionalId(blockId) || !isBefore(before, blockId)) return null;
  const { docId, at, settled } = common;
  return {
    kind: "recovered",
    docId,
    blockId,
    nearBlockId,
    text,
    at,
    settled,
    before,
  };
}

/** The entry `value` holds; null for one whose shape is refused, which stays in the map. */
export function readEntry(value: unknown): ReviewEntry | null {
  const common = isFields(value) ? readCommon(value) : null;
  if (!isFields(value) || common === null) return null;
  if (value.kind === "overlap") return readOverlap(value, common);
  return value.kind === "recovered" ? readRecovered(value, common) : null;
}

/** Every entry of the review map whose shape is read, with its id. */
export function readAll(review: JsonMapView): Listed[] {
  return Object.entries(review.entries()).flatMap(([id, value]) => {
    const entry = readEntry(value);
    return entry === null ? [] : [{ ...entry, id }];
  });
}

/**
 * The entry an item filed on the device becomes; `otherUserIds` are the other people who wrote its passage. An overlap
 * whose wordings the script could not hold as its block is kept as Recovered text.
 */
export function entryOf(
  item: RecoveredItem,
  otherUserIds: readonly string[],
): ReviewEntry {
  const { docId, nearBlockId, mine, theirs } = item;
  const at = item.recoveredAt;
  const blockId = item.blockId ?? mine?.attrs?.id;
  // read back, so it is stored with its fields in their order, or not as an overlap
  const overlap =
    item.cause === "overlap" && typeof blockId === "string"
      ? readEntry({
          kind: "overlap",
          docId,
          blockId,
          mine,
          theirs,
          otherUserIds: [...otherUserIds],
          at,
          settled: false,
          before: null,
          nearBlockId,
          copyId: null,
        })
      : null;
  return (
    overlap ?? {
      kind: "recovered",
      docId,
      blockId: item.blockId,
      nearBlockId,
      text: item.text,
      at,
      settled: false,
      before: null,
    }
  );
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
