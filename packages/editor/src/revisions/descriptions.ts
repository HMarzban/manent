// What assistive technology is told of each element a revision marks ("revised, Blue"), by the newest revision
// that marks it. Worked out again only for the blocks a transaction reaches, and for every block only when
// production itself changes.
import type { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { Mapping, StepMap } from "prosemirror-transform";
import { Decoration, DecorationSet } from "prosemirror-view";
import { blockPos } from "../pagination/block-index.ts";
import type { BlockIndex } from "../pagination/block-index.ts";
import type { PaginationState } from "../pagination/plugin.ts";
import type { RevisionKept } from "./derive.ts";
import type { ProductionView } from "./plugin.ts";

export interface Descriptions {
  /** What `set` was worked out from. */
  readonly kept: RevisionKept;
  readonly set: DecorationSet;
}

/** The newest revision that marks block `id`: the active one, else the latest issued one; null when none does. */
function nameOf(kept: RevisionKept, id: unknown): string | null {
  const { view } = kept;
  if (view === null || typeof id !== "string") return null;
  if (kept.marks.has(id)) return view.active.name;
  return view.earlier.findLast((source) => source.marks.has(id))?.name ?? null;
}

/** Adds the description of `block` at `pos` to `out`, if a revision marks it. */
function describe(
  kept: RevisionKept,
  block: Node,
  pos: number,
  out: Decoration[],
): void {
  const name = nameOf(kept, block.attrs.id);
  if (name === null || kept.view === null) return;
  out.push(
    Decoration.node(pos, pos + block.nodeSize, {
      "aria-description": kept.view.words.revisedDescription(name),
    }),
  );
}

/** Each block of `doc`, a section's child, that overlaps `from` to `to`, with its position. */
function eachBlock(
  doc: Node,
  [from, to]: readonly [number, number],
  visit: (block: Node, pos: number) => void,
): void {
  doc.nodesBetween(from, to, (node, pos, parent) => {
    if (parent === doc) return true;
    visit(node, pos);
    return false;
  });
}

const whole = (doc: Node): readonly [number, number] => [0, doc.content.size];

/** The descriptions of `doc` as `kept` marks it. */
export function descriptionsOf(doc: Node, kept: RevisionKept): Descriptions {
  const decorations: Decoration[] = [];
  if (kept.view !== null)
    eachBlock(doc, whole(doc), (block, pos) =>
      describe(kept, block, pos, decorations),
    );
  return { kept, set: DecorationSet.create(doc, decorations) };
}

// the revisions a description can name, and its words; an issue or another active revision changes them
const isSameSource = (a: ProductionView | null, b: ProductionView | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.earlier === b.earlier &&
    a.active.name === b.active.name &&
    a.words === b.words);

/** The blocks that gained or lost their mark since `prev`, by id, among those `kept` remarked and each removal's. */
function gainedOrLost(prev: RevisionKept, kept: RevisionKept): string[] {
  if (kept.marks === prev.marks) return [];
  const ids = [...(kept.remarked ?? [])];
  if (kept.removedAt !== prev.removedAt)
    ids.push(...prev.removedAt.keys(), ...kept.removedAt.keys());
  return ids.filter((id) => prev.marks.has(id) !== kept.marks.has(id));
}

/**
 * `prev` after `tr`, where the pages went from `before` to `pages`: the blocks the transaction replaced described
 * again, and the blocks elsewhere that gained or lost their mark; built again when production changed or every
 * block's mark was worked out again.
 */
export function nextDescriptions(
  prev: Descriptions,
  tr: Transaction,
  kept: RevisionKept,
  before: BlockIndex,
  pages: PaginationState,
): Descriptions {
  const was = prev.kept;
  if (
    !isSameSource(was.view, kept.view) ||
    (kept.marks !== was.marks && kept.remarked === null)
  )
    return descriptionsOf(tr.doc, kept);
  if (kept.view === null) return { kept, set: prev.set };
  const { change, index } = pages;
  let set = prev.set;
  let replaced: readonly [number, number] = [0, 0];
  if (change !== null && index.doc !== before.doc) {
    // every block outside the change is the same node, as far from either end, so a step that replaced them too
    // (a remote change replaces the whole script) leaves their descriptions in place
    const head = blockPos(before, change.first);
    const tail = before.doc.content.size - blockPos(before, change.oldEnd);
    const oldSize = tr.before.content.size - tail - head;
    const newSize = tr.doc.content.size - tail - head;
    const map = new StepMap([head, oldSize, newSize]);
    set = set.map(new Mapping([map]), tr.doc);
    replaced = [blockPos(index, change.first), blockPos(index, change.newEnd)];
  } else if (tr.docChanged) set = set.map(tr.mapping, tr.doc);
  const add: Decoration[] = [];
  const elsewhere = new Set<unknown>(gainedOrLost(was, kept));
  eachBlock(tr.doc, replaced, (block, pos) => {
    describe(kept, block, pos, add);
    elsewhere.delete(block.attrs.id);
  });
  const drop: Decoration[] = [];
  // a block outside the change gains or loses its mark only by a move, an override, a removal or an omitted scene,
  // each of which read every block
  if (elsewhere.size > 0)
    eachBlock(tr.doc, whole(tr.doc), (block, pos) => {
      if (!elsewhere.has(block.attrs.id)) return;
      const end = pos + block.nodeSize;
      drop.push(
        ...set.find(pos, end).filter((d) => d.from === pos && d.to === end),
      );
      describe(kept, block, pos, add);
    });
  // the set checks each added decoration against the document in one pass, so they go in in order
  const sorted = add.toSorted((a, b) => a.from - b.from);
  return { kept, set: set.remove(drop).add(tr.doc, sorted) };
}
