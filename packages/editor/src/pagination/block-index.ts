// A document's blocks as the engine reads them, and where each section sits, kept up to date by node identity.
import { DEFAULT_BLOCK_ATTRS, blockView, isBlockId } from "@manent/schema";
import { applyLayoutPatches, toLayoutBlock } from "@manent/pagination";
import type {
  ChangeHint,
  LayoutBlock,
  LayoutPatches,
} from "@manent/pagination";
import type { Node } from "prosemirror-model";

export interface BlockIndex {
  readonly doc: Node;
  /** Every block, in document order, with its layout patch applied. */
  readonly blocks: readonly LayoutBlock[];
  /** The key of the patches the blocks were built with. */
  readonly layoutKey: string | null;
  /** The index of each section's first block, and a last entry: blocks.length. */
  readonly sectionStart: Int32Array;
  /** The document position of each section. */
  readonly sectionPos: Int32Array;
}

/** A block node as the engine reads it; one whose attributes validation refuses is laid out as general, from its text. */
function plainBlock(node: Node): LayoutBlock {
  try {
    return toLayoutBlock(blockView(node));
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const id: unknown = node.attrs.id;
    return toLayoutBlock({
      attrs: {
        ...DEFAULT_BLOCK_ATTRS,
        id: isBlockId(id) ? id : null,
        type: "general",
      },
      runs: [{ text: node.textContent, marks: [] }],
    });
  }
}

function buildBlock(node: Node, layout: LayoutPatches | null): LayoutBlock {
  return applyLayoutPatches([plainBlock(node)], layout)[0]!;
}

function sectionsOf(doc: Node): {
  sectionStart: Int32Array;
  sectionPos: Int32Array;
} {
  const sectionStart = new Int32Array(doc.childCount + 1);
  const sectionPos = new Int32Array(doc.childCount);
  let pos = 0;
  doc.forEach((section, _, i) => {
    sectionPos[i] = pos;
    sectionStart[i + 1] = sectionStart[i]! + section.childCount;
    pos += section.nodeSize;
  });
  return { sectionStart, sectionPos };
}

function createIndex(
  doc: Node,
  blocks: readonly LayoutBlock[],
  layout: LayoutPatches | null,
): BlockIndex {
  return Object.freeze({
    doc,
    blocks,
    layoutKey: layout?.key ?? null,
    ...sectionsOf(doc),
  });
}

export function toIndex(
  doc: Node,
  layout: LayoutPatches | null = null,
): BlockIndex {
  const blocks: LayoutBlock[] = [];
  doc.forEach((section) =>
    section.forEach((node) => blocks.push(buildBlock(node, layout))),
  );
  return createIndex(doc, blocks, layout);
}

/** A block of the sections that differ, with its place in its section counted from either end. */
interface Placed {
  readonly node: Node;
  readonly fromStart: number;
  readonly fromEnd: number;
}

function placedBlocks(doc: Node, from: number, to: number): Placed[] {
  const placed: Placed[] = [];
  for (let s = from; s < to; s++) {
    const section = doc.child(s);
    section.forEach((node, _, i) =>
      placed.push({
        node,
        fromStart: i,
        fromEnd: section.childCount - 1 - i,
      }),
    );
  }
  return placed;
}

const isKept = (a: Placed, b: Placed, side: "fromStart" | "fromEnd") =>
  a.node === b.node && a[side] === b[side];

/**
 * The blocks that differ, found by node identity: the sections from both ends, then the blocks of the
 * sections between from both ends. A block that keeps its node but not its place in its section, as
 * when a section boundary moves, differs too, so every position outside the range is unchanged.
 */
function differingBlocks(
  prev: BlockIndex,
  doc: Node,
): { change: ChangeHint; nodes: readonly Node[]; old: readonly Node[] } {
  const before = prev.doc;
  const least = Math.min(before.childCount, doc.childCount);
  let head = 0;
  while (head < least && before.child(head) === doc.child(head)) head++;
  let tail = 0;
  while (
    tail < least - head &&
    before.child(before.childCount - 1 - tail) ===
      doc.child(doc.childCount - 1 - tail)
  )
    tail++;
  const old = placedBlocks(before, head, before.childCount - tail);
  const now = placedBlocks(doc, head, doc.childCount - tail);
  const shorter = Math.min(old.length, now.length);
  let first = 0;
  while (first < shorter && isKept(old[first]!, now[first]!, "fromStart"))
    first++;
  let last = 0;
  while (
    last < shorter - first &&
    isKept(old.at(-1 - last)!, now.at(-1 - last)!, "fromEnd")
  )
    last++;
  const start = prev.sectionStart[head]!;
  return {
    change: {
      first: start + first,
      oldEnd: start + old.length - last,
      newEnd: start + now.length - last,
    },
    nodes: now.slice(first, now.length - last).map((p) => p.node),
    old: old.slice(first, old.length - last).map((p) => p.node),
  };
}

// The patches a block was built with are not kept, so a block counts as patched when it is not what its node alone gives.
function isUnpatched(block: LayoutBlock, plain: LayoutBlock): boolean {
  return (
    block.type === plain.type &&
    block.text === plain.text &&
    block.num === plain.num &&
    (block.styles === null) === (plain.styles === null)
  );
}

/** Every block built again under other patches: a block patched before or now gets a new object, the rest keep theirs. */
function repatched(
  doc: Node,
  blocks: readonly LayoutBlock[],
  layout: LayoutPatches | null,
): LayoutBlock[] {
  const next: LayoutBlock[] = [];
  doc.forEach((section) =>
    section.forEach((node) => {
      const block = blocks[next.length]!;
      const plain = plainBlock(node);
      if (layout?.patches.has(plain.id) === true)
        next.push(buildBlock(node, layout));
      else next.push(isUnpatched(block, plain) ? block : plain);
    }),
  );
  return next;
}

/** The smallest range holding every block that is not the same object, from both ends; null when there is none. */
function changeOf(
  before: readonly LayoutBlock[],
  after: readonly LayoutBlock[],
): ChangeHint | null {
  const least = Math.min(before.length, after.length);
  let first = 0;
  while (first < least && before[first] === after[first]) first++;
  if (first === before.length && first === after.length) return null;
  let last = 0;
  while (
    last < least - first &&
    before[before.length - 1 - last] === after[after.length - 1 - last]
  )
    last++;
  return {
    first,
    oldEnd: before.length - last,
    newEnd: after.length - last,
  };
}

/** Both ranges in one, over the same old and new blocks. */
function union(
  a: ChangeHint,
  b: ChangeHint | null,
  oldLength: number,
): ChangeHint {
  if (b === null) return a;
  const tail = Math.min(oldLength - a.oldEnd, oldLength - b.oldEnd);
  const shift = a.newEnd - a.oldEnd;
  return {
    first: Math.min(a.first, b.first),
    oldEnd: oldLength - tail,
    newEnd: oldLength - tail + shift,
  };
}

/**
 * The index of `doc`, reusing every block of `prev` whose node is the same object and whose patches are
 * unchanged. `change` is null when no block changed or moved.
 */
export function updateIndex(
  prev: BlockIndex,
  doc: Node,
  layout: LayoutPatches | null = null,
): { index: BlockIndex; change: ChangeHint | null } {
  const sameKey = (layout?.key ?? null) === prev.layoutKey;
  if (doc === prev.doc && sameKey) return { index: prev, change: null };
  const diff = differingBlocks(prev, doc);
  const { change } = diff;
  const reused = new Map<Node, LayoutBlock>();
  diff.old.forEach((node, i) =>
    reused.set(node, prev.blocks[change.first + i]!),
  );
  const middle = diff.nodes.map(
    (node) =>
      (sameKey ? reused.get(node) : undefined) ?? buildBlock(node, layout),
  );
  let blocks: LayoutBlock[];
  if (change.oldEnd === change.newEnd) {
    blocks = prev.blocks.slice();
    for (let i = 0; i < middle.length; i++)
      blocks[change.first + i] = middle[i]!;
  } else {
    blocks = prev.blocks.slice(0, change.first);
    for (let i = 0; i < middle.length; i++) blocks.push(middle[i]!);
    for (let i = change.oldEnd; i < prev.blocks.length; i++)
      blocks.push(prev.blocks[i]!);
  }
  const moved = change.first < change.oldEnd || change.first < change.newEnd;
  if (sameKey) {
    const index = createIndex(doc, blocks, layout);
    return { index, change: moved ? change : null };
  }
  const rebuilt = repatched(doc, blocks, layout);
  const patched = changeOf(prev.blocks, rebuilt);
  return {
    index: createIndex(doc, rebuilt, layout),
    change: moved ? union(change, patched, prev.blocks.length) : patched,
  };
}

/** The section that holds block `block`, or the last one for blocks.length. */
function sectionOfBlock(index: BlockIndex, block: number): number {
  let lo = 0;
  let hi = index.sectionPos.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (index.sectionStart[mid]! <= block) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The position just before the block; for blocks.length, the position just after the last block. Throws RangeError out of range. */
export function blockPos(index: BlockIndex, block: number): number {
  if (!Number.isInteger(block) || block < 0 || block > index.blocks.length)
    throw new RangeError(
      `a block index must be from 0 to ${index.blocks.length}, not ${block}`,
    );
  const s = sectionOfBlock(index, block);
  const section = index.doc.child(s);
  let pos = index.sectionPos[s]! + 1;
  for (let i = 0; i < block - index.sectionStart[s]!; i++)
    pos += section.child(i).nodeSize;
  return pos;
}

/** The block that holds a position; a position between two sections belongs to the later one, and the document's end to the last block. */
export function blockAt(index: BlockIndex, pos: number): number {
  let lo = 0;
  let hi = index.sectionPos.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (index.sectionPos[mid]! <= pos) lo = mid;
    else hi = mid - 1;
  }
  const section = index.doc.child(lo);
  let end = index.sectionPos[lo]! + 1;
  for (let i = 0; i < section.childCount; i++) {
    end += section.child(i).nodeSize;
    if (pos < end) return index.sectionStart[lo]! + i;
  }
  return index.sectionStart[lo + 1]! - 1;
}
