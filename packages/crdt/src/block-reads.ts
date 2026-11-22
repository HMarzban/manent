// Blocks read by id: as they stand, without some typing, with who wrote in them and the scene they are in.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, RawElement, RawText } from "@manent/schema";
import * as Y from "yjs";
import { yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import {
  elementsNamed,
  materializeRawDoc,
  textsOf,
  yXmlFragmentForBinding,
} from "./mapping.ts";
import { readStateVector } from "./vectors.ts";

/** The body's blocks in document order, each section read only once the walk reaches it. */
function* blocksIn(doc: CrdtDoc): Generator<Y.XmlElement> {
  for (const section of elementsNamed(yXmlFragmentForBinding(doc), "section"))
    yield* elementsNamed(section, "block");
}

/** The first block with this id, in document order. */
function findBlock(doc: CrdtDoc, blockId: string): Y.XmlElement | null {
  for (const block of blocksIn(doc))
    if (block.getAttribute("id") === blockId) return block;
  return null;
}

function isRawText(node: RawElement | RawText): node is RawText {
  return node.type === "text" && !("content" in node);
}

/** The block's text children as materialize() reads them. */
function runsIn(block: Y.XmlElement): RawText[] {
  return materializeRawDoc(block).content.filter(isRawText);
}

function canonicalOf(block: Y.XmlElement, runs: RawText[]): BlockJSON {
  return canonicalBlock({
    type: "block",
    attrs: block.getAttributes(),
    content: runs,
  });
}

/** The text's items from its first live character on; Yjs keeps the head of the list private, and only deleted or format items lie before that one. */
function* liveItemsOf(
  store: Y.Doc["store"],
  text: Y.XmlText,
): Generator<Y.Item> {
  const first = Y.createRelativePositionFromTypeIndex(text, 0).item;
  if (first === null) return;
  for (
    let item: Y.Item | null = Y.getItem(store, first);
    item !== null;
    item = item.right
  )
    if (!item.deleted) yield item;
}

/** For each character of the block's text, in order: false when client c wrote it at a clock from exclude.get(c). */
function keptCharacters(
  store: Y.Doc["store"],
  block: Y.XmlElement,
  exclude: ReadonlyMap<number, number>,
): boolean[] {
  const kept: boolean[] = [];
  for (const text of textsOf(block))
    for (const item of liveItemsOf(store, text)) {
      if (!(item.content instanceof Y.ContentString)) continue;
      const from = exclude.get(item.id.client) ?? Infinity;
      // one item may hold typing from either side of `from`
      for (let i = 0; i < item.length; i++) kept.push(item.id.clock + i < from);
    }
  return kept;
}

function keptRuns(
  runs: readonly RawText[],
  kept: readonly boolean[],
): RawText[] {
  let at = 0;
  return runs.map((run) => {
    let text = "";
    for (let i = 0; i < run.text.length; i++)
      if (kept[at + i] === true) text += run.text.charAt(i);
    at += run.text.length;
    return { ...run, text };
  });
}

function isItemOf(struct: Y.Item | Y.GC, block: Y.XmlElement): boolean {
  if (!(struct instanceof Y.Item)) return false;
  const { parent } = struct;
  return (
    parent === block || (parent instanceof Y.XmlText && parent.parent === block)
  );
}

/** Whether one of a client's structs at a clock from `from` on is an attribute, a child or text of the block, deleted or not. */
function wroteIn(
  block: Y.XmlElement,
  structs: (Y.Item | Y.GC)[],
  from: number,
): boolean {
  const last = structs.at(-1);
  if (last === undefined || last.id.clock + last.length <= from) return false;
  for (let i = Y.findIndexSS(structs, from); i < structs.length; i++)
    if (isItemOf(structs[i]!, block)) return true;
  return false;
}

/** The blocks with these ids, canonical, in document order; an id with no block is absent. One walk reads every block's id and only the found blocks' text. */
export function readBlocks(
  doc: CrdtDoc,
  ids: ReadonlySet<string>,
): Map<string, BlockJSON> {
  const found = new Map<string, BlockJSON>();
  for (const block of blocksIn(doc)) {
    const id = block.getAttribute("id");
    if (typeof id === "string" && ids.has(id) && !found.has(id))
      found.set(id, canonicalOf(block, runsIn(block)));
  }
  return found;
}

/** A block's live text, and for each of its characters whether the clients asked about wrote it. */
export interface TypedText {
  text: string;
  typed: boolean[];
}

/**
 * Each block holding live text that client c wrote at a clock from since.get(c), the first block of
 * an id only.
 */
export function findTyped(
  doc: CrdtDoc,
  since: ReadonlyMap<number, number>,
): Map<string, TypedText> {
  const { store } = yDocOf(doc);
  const seen = new Set<string>();
  const found = new Map<string, TypedText>();
  for (const block of blocksIn(doc)) {
    const id = block.getAttribute("id");
    if (typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    const typed = keptCharacters(store, block, since).map((kept) => !kept);
    const text = runsIn(block)
      .map((run) => run.text)
      .join("");
    if (typed.includes(true)) found.set(id, { text, typed });
  }
  return found;
}

/**
 * The client ids, ascending, that wrote an attribute or text of the block at a
 * clock `since` does not hold, counting text deleted since; [] when the block
 * is gone. Throws CrdtUpdateError when `since` is not a state vector.
 */
export function blockAuthors(
  doc: CrdtDoc,
  blockId: string,
  since: Uint8Array,
): number[] {
  const block = findBlock(doc, blockId);
  if (block === null) return [];
  const held = readStateVector(since);
  const authors: number[] = [];
  for (const [client, structs] of yDocOf(doc).store.clients)
    if (wroteIn(block, structs, held.get(client) ?? 0)) authors.push(client);
  return authors.toSorted((x, y) => x - y);
}

/**
 * The block, canonical, without the live text client c wrote at a clock at or
 * above exclude.get(c); its attributes as they stand. Null when it is gone.
 */
export function readBlockExcluding(
  doc: CrdtDoc,
  blockId: string,
  exclude: ReadonlyMap<number, number>,
): BlockJSON | null {
  const block = findBlock(doc, blockId);
  if (block === null) return null;
  return canonicalOf(
    block,
    keptRuns(runsIn(block), keptCharacters(yDocOf(doc).store, block, exclude)),
  );
}

/**
 * The number of the scene the block is in: the stored `num` of the nearest
 * `scene_heading` or `slug` at or before it, else that heading's count among
 * them from 1. Null before the first heading, or when the block is gone.
 */
export function sceneOf(doc: CrdtDoc, blockId: string): string | null {
  let count = 0;
  let scene: string | null = null;
  for (const block of blocksIn(doc)) {
    const type = block.getAttribute("type");
    if (type === "scene_heading" || type === "slug") {
      count++;
      const num = block.getAttribute("num");
      scene = typeof num === "string" ? num : String(count);
    }
    if (block.getAttribute("id") === blockId) return scene;
  }
  return null;
}
