// What one change did to a script, found from what Yjs records for it and never by reading the script.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, RawElement, RawText } from "@manent/schema";
import * as Y from "yjs";
import { ORIGIN_REMOTE, throwAll, yDocOf } from "./doc.ts";
import type { CrdtDoc, Unsubscribe } from "./doc.ts";
import { noteBefore, parentOf, rootName } from "./held-before.ts";
import {
  FRAGMENT_NAME,
  elementsNamed,
  isElement,
  materializeRawDoc,
  runsOf,
} from "./mapping.ts";
import { mergeUpdates } from "./updates.ts";
import type { Update } from "./updates.ts";

/** The origin of block-targeted writes that re-apply a user's own work. */
export const ORIGIN_REPLAY = "replay";

/** What one change did to a script. Blocks are in the canonical form. */
export interface TransactionReport {
  /** The same bytes subscribe() delivers for the change, merged into one update. */
  update: Update;
  origin: unknown;
  /** Blocks that are new, in document order; `after` is the id of the block before it once the earlier entries are in place, null at the very start. */
  inserted: { block: BlockJSON; after: string | null }[];
  /** Blocks that existed before and whose attributes, text or marks changed. */
  changed: BlockJSON[];
  /** Ids of the blocks the change deleted. */
  removed: string[];
  /** Names of the document's root maps the change wrote, ascending. */
  maps: string[];
  /**
   * For validateBlocks: every inserted or changed block, raw and in full, and
   * every other node the change put where a section or a block belongs. A node
   * at the top that is not a section is named `top:<its name>`; text where a
   * block belongs is listed without its marks, and a section that carries
   * attributes is listed without its blocks, since each is refused for what it
   * is. Its length depends on the change, never on the script.
   */
  touched(): (RawElement | RawText)[];
  /** The plain value the root map `map` held at `key` before the change; undefined when it held nothing, held a type, or the change left the key alone. */
  before(map: string, key: string): unknown;
}

/** Where a type sits in the document, as far as a report cares. */
type Slot =
  | { kind: "block"; block: Y.XmlElement }
  | { kind: "other"; node: Y.XmlElement | Y.XmlText }
  | { kind: "map"; name: string };

/**
 * What the transactions of one change wrote, gathered while deleted content is
 * still readable. A type deleted by any of them leaves every set.
 */
interface Gathered {
  fragment: Y.XmlFragment;
  blocks: Set<Y.XmlElement>;
  created: Set<Y.XmlElement>;
  /** Sections, and nodes where a section or a block belongs that are neither. */
  others: Set<Y.XmlElement | Y.XmlText>;
  removed: string[];
  maps: Set<string>;
  /** Root map name, then key: what the key held before the first transaction that changed it. */
  before: Map<string, Map<string, unknown>>;
  updates: Update[];
}

function emptyGathered(fragment: Y.XmlFragment): Gathered {
  return {
    fragment,
    blocks: new Set(),
    created: new Set(),
    others: new Set(),
    removed: [],
    maps: new Set(),
    before: new Map(),
    updates: [],
  };
}

function other(node: unknown): Slot | null {
  return node instanceof Y.XmlElement || node instanceof Y.XmlText
    ? { kind: "other", node }
    : null;
}

/** Null for the body itself and for what validation never reads. */
function slotOf(fragment: Y.XmlFragment, type: unknown): Slot | null {
  const chain: unknown[] = [];
  let root = type;
  for (let parent = parentOf(root); parent !== null; parent = parentOf(root)) {
    chain.push(root);
    root = parent;
  }
  if (root !== fragment) {
    const name = rootName(fragment, root);
    return name === null ? null : { kind: "map", name };
  }
  const top = chain.at(-1);
  const second = chain.at(-2);
  if (top === undefined) return null;
  if (!isElement(top, "section") || second === undefined) return other(top);
  return isElement(second, "block")
    ? { kind: "block", block: second }
    : other(second);
}

function note(into: Gathered, type: unknown, created: boolean): void {
  const slot = slotOf(into.fragment, type);
  if (slot === null) return;
  switch (slot.kind) {
    case "block":
      into.blocks.add(slot.block);
      if (created && slot.block === type) into.created.add(slot.block);
      return;
    case "other":
      into.others.add(slot.node);
      return;
    case "map":
      into.maps.add(slot.name);
      return;
    default:
      slot satisfies never;
  }
}

/** A deleted block's id is read from its attributes as they stood at the end of the transaction. */
function noteDeleted(into: Gathered, type: unknown, end: Y.Snapshot): void {
  if (type instanceof Y.XmlText) into.others.delete(type);
  if (!(type instanceof Y.XmlElement)) return;
  const slot = slotOf(into.fragment, type);
  const id = type.getAttributes(end).id;
  // a block made and deleted within the change was never there
  const existed =
    slot?.kind === "block" && slot.block === type && !into.created.has(type);
  if (existed && typeof id === "string") into.removed.push(id);
  into.blocks.delete(type);
  into.created.delete(type);
  into.others.delete(type);
}

/** Keeps what `fn` throws: whatever throws into Yjs leaves the document unable to emit another update. */
function guarded(thrown: unknown[], fn: () => void): void {
  try {
    fn();
  } catch (error) {
    thrown.push(error);
  }
}

function liveId(block: Y.XmlElement): string | null {
  const id = block.getAttribute("id");
  return typeof id === "string" ? id : null;
}

function idsIn(section: Y.XmlElement): string[] {
  return elementsNamed(section, "block").flatMap(
    (block) => liveId(block) ?? [],
  );
}

/** Runs during afterTransaction, before Yjs collects deleted content. */
function gather(into: Gathered, tr: Y.Transaction): void {
  // Yjs lists no type made in this transaction as changed, and drops every type it deleted
  for (const type of tr.changed.keys()) note(into, type, false);
  for (const [client, after] of tr.afterState) {
    const before = tr.beforeState.get(client) ?? 0;
    const structs = tr.doc.store.clients.get(client);
    if (after === before || structs === undefined) continue;
    for (let i = Y.findIndexSS(structs, before); i < structs.length; i++) {
      const struct = structs[i];
      if (!(struct instanceof Y.Item)) continue;
      noteBefore(into.fragment, into.before, tr, struct);
      if (struct.content instanceof Y.ContentType)
        note(into, struct.content.type, true);
    }
  }
  const end = Y.createSnapshot(Y.createDeleteSet(), tr.afterState);
  Y.iterateDeletedStructs(tr, tr.deleteSet, (struct) => {
    if (!(struct instanceof Y.Item)) return;
    noteBefore(into.fragment, into.before, tr, struct);
    if (struct.content instanceof Y.ContentType)
      noteDeleted(into, struct.content.type, end);
  });
}

function isRawText(node: RawElement | RawText): node is RawText {
  return node.type === "text" && !("content" in node);
}

function rawBlock(block: Y.XmlElement): RawElement {
  return {
    type: "block",
    attrs: block.getAttributes(),
    content: materializeRawDoc(block).content,
  };
}

/** The block as materialize() gives it: its text children only, canonical. */
function canonicalOf(block: Y.XmlElement): BlockJSON {
  return canonicalBlock({
    type: "block",
    attrs: block.getAttributes(),
    content: materializeRawDoc(block).content.filter(isRawText),
  });
}

function otherEntries(
  fragment: Y.XmlFragment,
  node: Y.XmlElement | Y.XmlText,
): (RawElement | RawText)[] {
  const top = parentOf(node) === fragment;
  if (node instanceof Y.XmlText) {
    const runs = runsOf(node).map((run): RawText => ({
      type: "text",
      text: run.text,
      marks: [],
    }));
    return top && runs.length > 0
      ? [{ type: "top:text", attrs: {}, content: runs }]
      : runs;
  }
  const attrs = node.getAttributes();
  if (top && isElement(node, "section"))
    return Object.keys(attrs).length === 0
      ? []
      : [{ type: "section", attrs, content: [] }];
  return [
    {
      type: top ? `top:${node.nodeName}` : node.nodeName,
      attrs,
      content: materializeRawDoc(node).content,
    },
  ];
}

/** Walks outwards from `a` until `b` is met, so the cost is the distance between them. */
function isBefore(a: Y.XmlElement, b: Y.XmlElement): boolean {
  for (
    let left = a.prevSibling, right = a.nextSibling;
    left !== null || right !== null;
    left = left?.prevSibling ?? null, right = right?.nextSibling ?? null
  ) {
    if (right === b) return true;
    if (left === b) return false;
  }
  return false;
}

/** The id of the last block in the sections before this one. */
function lastIdBefore(section: Y.XmlElement): string | null {
  for (let at = section.prevSibling; at !== null; at = at.prevSibling) {
    if (!isElement(at, "section")) continue;
    const last = idsIn(at).at(-1);
    if (last !== undefined) return last;
  }
  return null;
}

function insertedInOrder(
  created: ReadonlySet<Y.XmlElement>,
): TransactionReport["inserted"] {
  const sections = new Set<Y.XmlElement>();
  for (const block of created) {
    const section = parentOf(block);
    if (section instanceof Y.XmlElement) sections.add(section);
  }
  const ordered = [...sections].toSorted((x, y) => (isBefore(x, y) ? -1 : 1));
  const inserted: TransactionReport["inserted"] = [];
  for (const section of ordered) {
    let previous = lastIdBefore(section);
    for (const block of elementsNamed(section, "block")) {
      if (created.has(block))
        inserted.push({ block: canonicalOf(block), after: previous });
      previous = liveId(block) ?? previous;
    }
  }
  return inserted;
}

function reportOf(
  gathered: Gathered,
  origin: unknown,
): TransactionReport | null {
  if (gathered.updates.length === 0) return null;
  const created = [...gathered.created];
  const changed = [...gathered.blocks].filter(
    (block) => !gathered.created.has(block),
  );
  const others = [...gathered.others];
  return {
    update: mergeUpdates(gathered.updates),
    origin,
    inserted: insertedInOrder(gathered.created),
    changed: changed.map(canonicalOf),
    removed: [...gathered.removed],
    maps: [...gathered.maps].toSorted(),
    before: (map, key) => gathered.before.get(map)?.get(key),
    touched: () => [
      ...[...created, ...changed].map(rawBlock),
      ...others.flatMap((node) => otherEntries(gathered.fragment, node)),
    ],
  };
}

/**
 * Applies the update as CrdtDoc.applyUpdate does (default origin ORIGIN_REMOTE)
 * and reports what it did, gathered across every transaction Yjs ran for it.
 * Null when the update changed nothing. Throws CrdtUpdateError like
 * applyUpdate, having changed nothing.
 */
export function applyInspecting(
  doc: CrdtDoc,
  update: Update,
  origin: unknown = ORIGIN_REMOTE,
): TransactionReport | null {
  const ydoc = yDocOf(doc);
  const fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
  const gathered = emptyGathered(fragment);
  const thrown: unknown[] = [];
  const onTransaction = (tr: Y.Transaction) =>
    guarded(thrown, () => gather(gathered, tr));
  const onUpdate = (bytes: Update) => gathered.updates.push(bytes);
  ydoc.on("afterTransaction", onTransaction);
  ydoc.on("update", onUpdate);
  try {
    doc.applyUpdate(update, origin);
  } finally {
    ydoc.off("afterTransaction", onTransaction);
    ydoc.off("update", onUpdate);
  }
  throwAll(thrown);
  return reportOf(gathered, origin);
}

/**
 * Calls `listener` with one report per transaction that changed the document,
 * whoever made it, when Yjs emits its update. The formatting Yjs tidies after a
 * remote change is a change of its own, with origin null. What the listener
 * throws is held until Yjs has finished every transaction, then thrown to the
 * caller of the write or apply.
 */
export function observeScript(
  doc: CrdtDoc,
  listener: (report: TransactionReport) => void,
): Unsubscribe {
  const ydoc = yDocOf(doc);
  const fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
  const gathering = new Map<Y.Transaction, Gathered>();
  const thrown: unknown[] = [];
  const onTransaction = (tr: Y.Transaction) => {
    const gathered = emptyGathered(fragment);
    gathering.set(tr, gathered);
    guarded(thrown, () => gather(gathered, tr));
  };
  const onUpdate = (
    bytes: Update,
    origin: unknown,
    _doc: Y.Doc,
    tr: Y.Transaction,
  ) => {
    const gathered = gathering.get(tr);
    if (gathered === undefined) return;
    gathered.updates.push(bytes);
    guarded(thrown, () => {
      const report = reportOf(gathered, origin);
      if (report !== null) listener(report);
    });
  };
  // Yjs has reset its transaction state by now, so a throw here cannot stall the document
  const onAllTransactions = () => {
    gathering.clear();
    throwAll(thrown.splice(0));
  };
  ydoc.on("afterTransaction", onTransaction);
  ydoc.on("update", onUpdate);
  ydoc.on("afterAllTransactions", onAllTransactions);
  return () => {
    ydoc.off("afterTransaction", onTransaction);
    ydoc.off("update", onUpdate);
    ydoc.off("afterAllTransactions", onAllTransactions);
  };
}

/** Every block id in document order; a block with no id is skipped. */
export function blockIds(doc: CrdtDoc): string[] {
  return elementsNamed(
    yDocOf(doc).getXmlFragment(FRAGMENT_NAME),
    "section",
  ).flatMap(idsIn);
}
