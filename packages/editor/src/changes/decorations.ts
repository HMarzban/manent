// What the page draws of a comparison: added text underlined as an ins, deleted text and removed blocks struck
// through as a del beside the text, and each added or changed block marked by its node.
import type { ChangeHint } from "@manent/pagination";
import { textOf } from "@manent/revisions";
import type { BlockEntry } from "@manent/revisions";
import type { Node } from "prosemirror-model";
import { Mapping, StepMap } from "prosemirror-transform";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import { blockPos } from "../pagination/block-index.ts";
import type { BlockIndex } from "../pagination/block-index.ts";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit of the UTF-16 units, as 8 hex digits. */
function hashOf(text: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), FNV_PRIME) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

function struck(view: EditorView, text: string): HTMLElement {
  const del = view.dom.ownerDocument.createElement("del");
  del.className = "mn-removed";
  del.textContent = text;
  return del;
}

function removedBlock(view: EditorView, text: string): HTMLElement {
  const del = struck(view, text);
  del.setAttribute("data-changes", "removed");
  del.setAttribute("contenteditable", "false");
  return del;
}

// The decorations of one live block, whose node runs from `from` to `to`. Each names the block in its spec as
// `blockId`; the node decoration of an added or changed block also names its kind there as `changes`.
function blockDecorations(
  entry: BlockEntry,
  from: number,
  to: number,
): Decoration[] {
  if (entry.kind !== "added" && entry.kind !== "changed") return [];
  const node = Decoration.node(
    from,
    to,
    { "data-changes": entry.kind },
    { blockId: entry.id, changes: entry.kind },
  );
  if (entry.kind === "added") return [node];
  const text = from + 1;
  const marks = entry.inline.map((change) =>
    change.kind === "deleted"
      ? Decoration.widget(
          text + change.offset,
          (view) => struck(view, change.text),
          {
            side: -1,
            key: `del:${entry.id}:${change.offset}:${hashOf(change.text)}`,
            blockId: entry.id,
          },
        )
      : Decoration.inline(
          text + change.offset,
          text + change.offset + change.length,
          { nodeName: "ins", class: "mn-added" },
          { blockId: entry.id },
        ),
  );
  return [...marks, node];
}

// A removed block, drawn at `pos` with its text struck through; its spec names it as `removedId`.
function removedDecoration(entry: BlockEntry, pos: number): Decoration {
  const text = entry.older === null ? "" : textOf(entry.older);
  return Decoration.widget(pos, (view) => removedBlock(view, text), {
    // widgets at one position are drawn in the order of their sides
    side: 1 + (entry.olderIndex ?? 0),
    key: `removed:${entry.id}:${hashOf(text)}`,
    removedId: entry.id,
  });
}

/** A removed block to draw after live block `after`; -1: before the first block. */
export interface PlacedRemoval {
  readonly entry: BlockEntry;
  readonly after: number;
}

function blockEnd(index: BlockIndex, k: number): number {
  const from = blockPos(index, k);
  return from + index.doc.nodeAt(from)!.nodeSize;
}

function removedDecorations(
  index: BlockIndex,
  placed: readonly PlacedRemoval[],
): Decoration[] {
  return placed.map(({ entry, after }) =>
    removedDecoration(
      entry,
      after < 0 ? blockPos(index, 0) : blockEnd(index, after),
    ),
  );
}

/** Every decoration of the live entries, one per block of `index` in its order, and of the removed blocks placed. */
export function drawChanges(
  index: BlockIndex,
  live: readonly BlockEntry[],
  placed: readonly PlacedRemoval[],
): DecorationSet {
  const found: Decoration[] = [];
  let k = 0;
  index.doc.forEach((section, offset) =>
    section.forEach((node, inner) => {
      const from = offset + 1 + inner;
      found.push(...blockDecorations(live[k++]!, from, from + node.nodeSize));
    }),
  );
  return DecorationSet.create(index.doc, [
    ...found,
    ...removedDecorations(index, placed),
  ]);
}

/** What a change draws anew: the live entries, the ids of the blocks it replaced, and the removed blocks placed. */
export interface Redraw {
  readonly live: readonly BlockEntry[];
  readonly replaced: ReadonlySet<string>;
  readonly placed: readonly PlacedRemoval[];
  /** The removed entries by id, before the change and after it. */
  readonly was: ReadonlyMap<string, BlockEntry>;
  readonly removed: ReadonlyMap<string, BlockEntry>;
}

// One step over the changed blocks, from the end of the block before them to the start of the block after them,
// from `before` (the document `set` is in) to `index.doc`: the blocks outside are the same nodes, so their
// decorations keep their places even where the transaction's own steps replaced them.
function changeMapping(
  before: Node,
  index: BlockIndex,
  change: ChangeHint,
): Mapping {
  const start =
    change.first === 0 ? blockPos(index, 0) : blockEnd(index, change.first - 1);
  const end = blockPos(index, change.newEnd);
  const oldEnd = before.content.size - (index.doc.content.size - end);
  return new Mapping([new StepMap([start, oldEnd - start, end - start])]);
}

/** `set`, in the document `before`, after `change`: the replaced blocks and the removed blocks placed drawn anew. */
export function redrawChanges(
  set: DecorationSet,
  before: Node,
  index: BlockIndex,
  change: ChangeHint,
  redraw: Redraw,
): DecorationSet {
  const mapped = set.map(changeMapping(before, index, change), index.doc);
  const placed = new Set(redraw.placed.map(({ entry }) => entry.id));
  const start = blockPos(index, change.first);
  // the node decoration of the block before ends where the range starts
  const local = mapped
    .find(
      start,
      blockPos(index, change.newEnd),
      (spec) => redraw.replaced.has(spec.blockId) || placed.has(spec.removedId),
    )
    .filter((d) => d.from >= start);
  // a removed block drawn before that is gone, or placed after another block, may be drawn anywhere
  const far = new Set(
    [...redraw.was].flatMap(([id, entry]) =>
      redraw.removed.get(id) === entry ? [] : [id],
    ),
  );
  const distant =
    far.size === 0
      ? []
      : mapped.find(undefined, undefined, (spec) => far.has(spec.removedId));
  const fresh: Decoration[] = [];
  for (let k = change.first; k < change.newEnd; k++) {
    const from = blockPos(index, k);
    fresh.push(...blockDecorations(redraw.live[k]!, from, blockEnd(index, k)));
  }
  return mapped
    .remove([...local, ...distant])
    .add(index.doc, [...fresh, ...removedDecorations(index, redraw.placed)]);
}
