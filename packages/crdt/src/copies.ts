// Blocks a push left twice, and the authority's repair of them: two blocks holding one ID, or two
// tails of one block split at the same moment.
import { canonicalBlock, parseFrom } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import * as Y from "yjs";
import { blockAuthors } from "./block-reads.ts";
import { yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import {
  blockJSON,
  elementsNamed,
  isElement,
  liveItemsOf,
  yXmlFragmentForBinding,
} from "./mapping.ts";
import { writeStateVector } from "./vectors.ts";
import { deleteBlockElement } from "./writer.ts";

/** A Yjs item id: where a block's element is, whatever ID the block holds. */
interface ItemRef {
  clientId: number;
  clock: number;
}

/** A block a push made that copies another; `kept` and `copy` are canonical, read as the push left them. */
export interface CopyPair {
  kind: "same_id" | "split_race";
  kept: BlockJSON;
  copy: BlockJSON;
  /** The same block once `id` and `from` are left out. */
  identical: boolean;
  /** The copy's element: a writer addressed by ID reaches only the first block holding it. */
  copyRef: ItemRef;
}

/** A copy that differs from the block it copies, left in the script for its pusher to review. */
export interface RepairedCopy {
  /** The kept block's ID, which only it holds once the repair is written. */
  blockId: string;
  /** The copy's ID after the repair: a new one for a same-ID copy, a tail's own for a split race. */
  copyId: string;
  kept: BlockJSON;
  copy: BlockJSON;
  /** The client ids, ascending, that wrote the kept block. */
  keptAuthors: number[];
}

/** A block of the body as the walk reads it: where it is, and its two identity attributes. */
interface Carrier {
  element: Y.XmlElement;
  item: Y.Item;
  id: string | null;
  from: string | null;
  /** Made by the push. */
  pushed: boolean;
}

/** A client's clock range in a push, `fromClock` inclusive and `toClock` exclusive. */
interface Range {
  clientId: number;
  fromClock: number;
  toClock: number;
}

const textOf = (block: BlockJSON): string =>
  (block.content ?? []).map((run) => run.text).join("");

const readOf = (carrier: Carrier): BlockJSON =>
  canonicalBlock(blockJSON(carrier.element));

// every block a pair names holds an ID
const idOf = (block: BlockJSON): string => String(block.attrs?.id);

const refOf = ({ id }: Y.Item): ItemRef => ({
  clientId: id.client,
  clock: id.clock,
});

/** The block's canonical JSON with `id` and `from` left out, as a string. */
function contentKey(block: BlockJSON): string {
  const attrs = Object.entries(block.attrs ?? {}).filter(
    ([key]) => key !== "id" && key !== "from",
  );
  return JSON.stringify({ ...block, attrs: Object.fromEntries(attrs) });
}

function carriersOf(doc: CrdtDoc, ranges: readonly Range[]): Carrier[] {
  const pushed = ({ client, clock }: Y.ID): boolean =>
    ranges.some(
      (r) => r.clientId === client && clock >= r.fromClock && clock < r.toClock,
    );
  const { store } = yDocOf(doc);
  const carriers: Carrier[] = [];
  for (const section of elementsNamed(yXmlFragmentForBinding(doc), "section"))
    for (const item of liveItemsOf(store, section)) {
      const element =
        item.content instanceof Y.ContentType ? item.content.type : null;
      if (!isElement(element, "block")) continue;
      const id = element.getAttribute("id");
      const from = element.getAttribute("from");
      carriers.push({
        element,
        item,
        id: typeof id === "string" ? id : null,
        from: typeof from === "string" ? from : null,
        pushed: pushed(item.id),
      });
    }
  return carriers;
}

function pairOf(
  kind: CopyPair["kind"],
  kept: BlockJSON,
  copy: BlockJSON,
  item: Y.Item,
): CopyPair {
  const identical = contentKey(kept) === contentKey(copy);
  return { kind, kept, copy, identical, copyRef: refOf(item) };
}

/** For each ID a pushed block holds with another: the first holder the push did not make is kept, else the first. */
function sameIdPairs(carriers: readonly Carrier[]): CopyPair[] {
  const byId = new Map<string, Carrier[]>();
  for (const carrier of carriers)
    if (carrier.id !== null)
      byId.set(carrier.id, [...(byId.get(carrier.id) ?? []), carrier]);
  return [...byId.values()].flatMap((held) => {
    if (held.length < 2 || !held.some((c) => c.pushed)) return [];
    const kept = held.find((c) => !c.pushed) ?? held[0]!;
    return held
      .filter((c) => c !== kept && c.pushed)
      .map((copy) => pairOf("same_id", readOf(kept), readOf(copy), copy.item));
  });
}

/**
 * A tail split at the same moment as the pushed one: split from the same block, made before this
 * push, never the block the pushed tail was placed against, and with text that one of the two ends.
 */
function raceOf(
  tail: Carrier,
  origin: string,
  carriers: readonly Carrier[],
): CopyPair | null {
  const copy = readOf(tail);
  const copyText = textOf(copy);
  for (const other of carriers) {
    // a moved block's `from` names itself: the block both tails were split from is no tail
    if (other.pushed || other.id === null || other.id === origin) continue;
    if (parseFrom(other.from)?.originId !== origin) continue;
    const { id } = other.item;
    const { origin: left, rightOrigin: right } = tail.item;
    if (Y.compareIDs(left, id) || Y.compareIDs(right, id)) continue;
    const kept = readOf(other);
    const keptText = textOf(kept);
    if (copyText.endsWith(keptText) || keptText.endsWith(copyText))
      return pairOf("split_race", kept, copy, tail.item);
  }
  return null;
}

const keyOf = ({ clientId, clock }: ItemRef): string => `${clientId}:${clock}`;

/**
 * The blocks the push made that copy another block, found from the push's clock ranges
 * (`fromClock` inclusive, `toClock` exclusive): one holding the ID of another, and a tail split from
 * a block at the same moment as another tail of it. The walk reads two attributes of each block,
 * and the text only of the blocks it pairs.
 */
export function findCopies(doc: CrdtDoc, ranges: readonly Range[]): CopyPair[] {
  const carriers = carriersOf(doc, ranges);
  const same = sameIdPairs(carriers);
  const paired = new Set(same.map((pair) => keyOf(pair.copyRef)));
  const races = carriers.flatMap((tail) => {
    const origin = parseFrom(tail.from)?.originId;
    if (!tail.pushed || tail.id === null || origin === undefined) return [];
    if (origin === tail.id || paired.has(keyOf(refOf(tail.item)))) return [];
    const race = raceOf(tail, origin, carriers);
    return race === null ? [] : [race];
  });
  return [...same, ...races];
}

function elementAt(ydoc: Y.Doc, ref: ItemRef): Y.XmlElement | null {
  const item = Y.getItem(ydoc.store, Y.createID(ref.clientId, ref.clock));
  const live = item instanceof Y.Item && !item.deleted;
  const type =
    live && item.content instanceof Y.ContentType ? item.content.type : null;
  return type instanceof Y.XmlElement ? type : null;
}

/**
 * Repairs the pairs in one transaction: an identical copy is deleted, with its section when it is
 * the section's only block; a same-ID copy that differs takes an ID from `newId`; a tail that
 * differs is left as it is. Answers each copy that differs, for review.
 */
export function repairCopies(
  doc: CrdtDoc,
  pairs: readonly CopyPair[],
  newId: () => string,
): RepairedCopy[] {
  const ydoc = yDocOf(doc);
  const fragment = yXmlFragmentForBinding(doc);
  const left: { pair: CopyPair; copyId: string }[] = [];
  ydoc.transact(() => {
    for (const pair of pairs) {
      const element = elementAt(ydoc, pair.copyRef);
      if (element === null) continue;
      if (pair.identical) {
        deleteBlockElement(fragment, element);
        continue;
      }
      const copyId = pair.kind === "same_id" ? newId() : idOf(pair.copy);
      if (pair.kind === "same_id") element.setAttribute("id", copyId);
      left.push({ pair, copyId });
    }
  });
  const none = writeStateVector(new Map());
  return left.map(({ pair, copyId }) => {
    const blockId = idOf(pair.kept);
    const keptAuthors = blockAuthors(doc, blockId, none);
    return { blockId, copyId, kept: pair.kept, copy: pair.copy, keptAuthors };
  });
}
