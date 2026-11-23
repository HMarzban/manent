// Page breaks, furniture and what each block shows of the pages as decorations, built again only where the pages changed.
import { engineFor, isSceneBoundary, specKey } from "@manent/pagination";
import type {
  ChangeHint,
  Engine,
  LayoutBlock,
  Pagination,
} from "@manent/pagination";
import type { Node } from "prosemirror-model";
import { Mapping, StepMap } from "prosemirror-transform";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { BreakStyle, LayoutView } from "../page/config.ts";
import { blockAttrs, columnOf, firstsOnPages } from "./block-attrs.ts";
import type { BlockContext } from "./block-attrs.ts";
import { blockPos } from "./block-index.ts";
import type { BlockIndex } from "./block-index.ts";
import { toBreakSpecs, toRuleSpecs } from "./break-specs.ts";
import type { BreakSpec } from "./break-specs.ts";
import type { PaginationState } from "./plugin.ts";
import { renderBreak, renderCast } from "./widgets.ts";

export interface DecorationOptions {
  readonly style: BreakStyle;
  /** Reflow view draws each page's start as a rule, in place of the breaks. */
  readonly view: LayoutView;
  /** The title of text outside the script font. */
  readonly offFontNote: string;
}

/** Throws RangeError when this build does not carry the engine that made the pagination. */
function engineOf(p: Pagination): Engine {
  const engine = engineFor(p.engineVersion);
  if (engine === null)
    throw new RangeError(`this build carries no engine ${p.engineVersion}`);
  return engine;
}

function widgetOf(spec: BreakSpec): Decoration {
  return Decoration.widget(spec.pos, () => renderBreak(spec), {
    key: spec.key,
    side: spec.side,
    stopEvent: () => true,
    ignoreSelection: true,
  });
}

/** Calls `visit` with each block in [from, to), the position before it and its node. */
function eachBlock(
  index: BlockIndex,
  from: number,
  to: number,
  visit: (i: number, pos: number, node: Node) => void,
): void {
  if (from >= to) return;
  const $start = index.doc.resolve(blockPos(index, from));
  let section = $start.index(0);
  let child = $start.index(1);
  let pos = $start.pos;
  for (let i = from; i < to; i++) {
    if (child === index.doc.child(section).childCount) {
      // past the section's close and the next one's open
      pos += 2;
      section++;
      child = 0;
    }
    const node = index.doc.child(section).child(child);
    visit(i, pos, node);
    pos += node.nodeSize;
    child++;
  }
}

/** Every decoration that belongs to blocks [from, to): the breaks before and inside them, their node decorations and their text outside the script font. */
export function decorationsFor(
  index: BlockIndex,
  p: Pagination,
  from: number,
  to: number,
  options: DecorationOptions,
): Decoration[] {
  if (from >= to) return [];
  const engine = engineOf(p);
  const fromPos = blockPos(index, from);
  const toPos =
    to < index.blocks.length ? blockPos(index, to) : Number.POSITIVE_INFINITY;
  const specs =
    options.view === "reflow"
      ? toRuleSpecs(index, p)
      : toBreakSpecs(index, p, options.style);
  const decorations = specs
    .filter((spec) => spec.pos >= fromPos && spec.pos < toPos)
    .map(widgetOf);
  const context: BlockContext = {
    p,
    engine,
    firsts: firstsOnPages(p),
    rows: new Set(Object.values(p.profile.elements)),
  };
  eachBlock(index, from, to, (i, pos, node) => {
    const attrs = blockAttrs(context, i);
    if (attrs !== null)
      decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    const cast = engine.castList(p, i);
    if (cast !== null)
      decorations.push(
        Decoration.widget(pos + node.nodeSize - 1, () => renderCast(cast), {
          key: `cast:${cast}`,
          side: 1,
          ignoreSelection: true,
        }),
      );
    const runs = engine.offFontRanges(node.textContent);
    for (let r = 0; r + 1 < runs.length; r += 2)
      decorations.push(
        Decoration.inline(pos + 1 + runs[r]!, pos + 1 + runs[r + 1]!, {
          nodeName: "mn-offfont",
          title: options.offFontNote,
        }),
      );
  });
  return decorations;
}

/** The position just after block `block`. */
function blockEnd(index: BlockIndex, block: number): number {
  const pos = blockPos(index, block);
  return pos + index.doc.nodeAt(pos)!.nodeSize;
}

// One step over the changed blocks' document range: from the end of the block before them, so a section
// boundary that moved is inside it, to the start of the block after them.
function changeMapping(
  before: BlockIndex,
  after: BlockIndex,
  change: ChangeHint,
): Mapping {
  const start =
    change.first === 0
      ? blockPos(before, 0)
      : blockEnd(before, change.first - 1);
  const oldEnd = blockPos(before, change.oldEnd);
  const newEnd = blockPos(after, change.newEnd);
  return new Mapping([new StepMap([start, oldEnd - start, newEnd - start])]);
}

// Page `a` of `p` draws its break and its blocks as page `b` of `old` did, its blocks `shift` later.
function isDrawnAsBefore(
  p: Pagination,
  a: number,
  old: Pagination,
  b: number,
  shift: number,
): boolean {
  const x = p.pages[a]!;
  const y = old.pages[b]!;
  const above = p.pages[a - 1];
  const wasAbove = old.pages[b - 1];
  const sameRight =
    x.right === null
      ? y.right === null
      : y.right !== null &&
        x.right.block === y.right.block + shift &&
        x.right.line === y.right.line &&
        x.right.offset === y.right.offset;
  return (
    sameRight &&
    x.block === y.block + shift &&
    x.line === y.line &&
    x.offset === y.offset &&
    x.label === y.label &&
    x.more === y.more &&
    x.contd === y.contd &&
    x.contdRight === y.contdRight &&
    x.sceneContinued === y.sceneContinued &&
    x.topUnits === y.topUnits &&
    x.usedUnits === y.usedUnits &&
    (above === undefined
      ? wasAbove === undefined
      : wasAbove !== undefined &&
        above.usedUnits === wasAbove.usedUnits &&
        above.more === wasAbove.more)
  );
}

// The blocks in [from, to) that `numberOf` numbers.
function numberedCount(
  from: number,
  to: number,
  numberOf: (i: number) => unknown,
): number {
  let count = 0;
  for (let i = from; i < to; i++) if (numberOf(i) !== null) count++;
  return count;
}

// The block that starts the scene holding block `before`; -1 at the script's start.
function sceneStartOf(blocks: readonly LayoutBlock[], before: number): number {
  for (let j = before; j >= 0; j--)
    if (isSceneBoundary(specKey(blocks[j]!.type, blocks[j]!.kind))) return j;
  return -1;
}

/**
 * The blocks whose decorations can differ: the changed blocks and the one after them; the blocks of every page that is not drawn as
 * before, from the first page that is not the old object to the first page from which every page is drawn as
 * before; the next cue's suffix and the dual run after the change; the scene heading above the change when its
 * cast list changed; and, when a numbered scene or speech was added or removed, every block after.
 */
function affectedBlocks(
  old: Pagination,
  p: Pagination,
  change: ChangeHint,
): { from: number; to: number } {
  const engine = engineOf(p);
  const n = p.blocks.length;
  const shift = change.newEnd - change.oldEnd;
  const pages = p.pages.length;
  const oldPages = old.pages.length;
  let first = 0;
  while (
    first < Math.min(pages, oldPages) &&
    p.pages[first] === old.pages[first]
  )
    first++;
  let tail = 0;
  while (
    tail < Math.min(pages, oldPages) &&
    isDrawnAsBefore(p, pages - 1 - tail, old, oldPages - 1 - tail, shift)
  )
    tail++;
  let from = change.first;
  // the block after the change too: its break sits where the step ends, and the step drops a widget there
  let to = Math.max(
    change.newEnd + 1,
    tail > 0 ? p.pages[pages - tail]!.block : n,
  );
  const cover = (block: number) => {
    from = Math.min(from, block);
    to = Math.max(to, block + 1);
  };
  // an old block's index in the new blocks; one that was replaced counts as the first changed block
  const now = (block: number) =>
    block < change.first
      ? block
      : block >= change.oldEnd
        ? block + shift
        : change.first;
  for (let k = first; k < pages - tail; k++) {
    cover(p.pages[k]!.block);
    if (p.pages[k]!.right !== null) cover(p.pages[k]!.right!.block);
  }
  for (let k = first; k < oldPages - tail; k++) {
    cover(now(old.pages[k]!.block));
    if (old.pages[k]!.right !== null) cover(now(old.pages[k]!.right!.block));
  }
  for (let i = change.newEnd; i < n; i++) {
    if (
      engine.contdSuffix(p, i) !== engine.contdSuffix(old, i - shift) ||
      columnOf(p.blocks, i) !== columnOf(old.blocks, i - shift)
    )
      to = Math.max(to, i + 1);
    // the cues after the next one read nothing before it
    if (p.blocks[i]!.type === "character" && p.blocks[i]!.dual === null) break;
  }
  const { furniture } = p.profile;
  if (furniture.castLists) {
    const heading = sceneStartOf(p.blocks, change.first - 1);
    if (
      heading >= 0 &&
      engine.castList(p, heading) !== engine.castList(old, heading)
    )
      cover(heading);
  }
  const counted = (numberOf: (q: Pagination, i: number) => unknown) =>
    numberedCount(change.first, change.newEnd, (i) => numberOf(p, i)) !==
    numberedCount(change.first, change.oldEnd, (i) => numberOf(old, i));
  if (
    (furniture.scenesNumbered && counted(engine.sceneNumber)) ||
    (furniture.speechesNumbered && counted(engine.speechNumber))
  )
    to = n;
  return { from: Math.min(from, n), to: Math.min(to, n) };
}

/**
 * The decorations after a change: built whole with no `prev`; otherwise `prev`'s, moved past the changed
 * blocks by one step, with those of the affected blocks built again. With nothing changed, `prev`'s.
 */
export function updateDecorations(
  prev: PaginationState | null,
  index: BlockIndex,
  p: Pagination,
  change: ChangeHint | null,
  options: DecorationOptions,
): DecorationSet {
  const n = index.blocks.length;
  if (prev === null)
    return DecorationSet.create(
      index.doc,
      decorationsFor(index, p, 0, n, options),
    );
  if (change === null) return prev.decorations;
  // a composition's decorations were mapped through its own steps, so they are in this document already
  const mapped = prev.frozen
    ? prev.decorations
    : prev.decorations.map(changeMapping(prev.index, index, change), index.doc);
  const { from, to } = affectedBlocks(prev.pagination, p, change);
  if (from >= to) return mapped;
  const fromPos = blockPos(index, from);
  const toPos = to < n ? blockPos(index, to) : index.doc.content.size;
  const stale = mapped
    .find(fromPos, toPos)
    .filter((d) => d.from >= fromPos && (to === n || d.from < toPos));
  return mapped
    .remove(stale)
    .add(index.doc, decorationsFor(index, p, from, to, options));
}
