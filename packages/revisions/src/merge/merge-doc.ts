// The three-way merge of a document, block by block, and its carrying through later states.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, BlockOp, DocJSON } from "@manent/schema";
import { applyBlockOpsToJSON } from "./apply-ops.ts";
import { mergeBlock } from "./merge-block.ts";

/** A block both sides changed so that the changes touch: theirs is kept, mine is to review. */
export interface Overlap {
  blockId: string;
  mine: BlockJSON;
  theirs: BlockJSON;
}

/** The text of a block mine changed and theirs no longer holds. */
export interface SetAsideBlock {
  blockId: string;
  /** The nearest earlier block of mine that the result holds; null when none. */
  nearBlockId: string | null;
  text: string;
}

export interface BlockMerge {
  ops: BlockOp[];
  overlaps: Overlap[];
  setAside: SetAsideBlock[];
  /** The distinct blocks the ops write. */
  applied: number;
  /** Theirs with the ops applied. */
  result: DocJSON;
}

type Outcome =
  | { kind: "nothing" }
  | { kind: "insert" }
  | { kind: "replace"; block: BlockJSON }
  | { kind: "set_aside" }
  | { kind: "overlap"; theirs: BlockJSON };

const NOTHING: Outcome = Object.freeze({ kind: "nothing" });

function blocksIn(doc: DocJSON): BlockJSON[] {
  return (doc.content ?? []).flatMap((section) => section.content ?? []);
}

function textOf(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

function idOf(block: BlockJSON): string | null {
  const id = block.attrs?.id;
  return typeof id === "string" ? id : null;
}

/** Each block by ID; the first wins when an ID repeats. */
function byId(doc: DocJSON): Map<string, BlockJSON> {
  const found = new Map<string, BlockJSON>();
  for (const block of blocksIn(doc)) {
    const id = idOf(block);
    if (id !== null && !found.has(id)) found.set(id, block);
  }
  return found;
}

function isSame(a: BlockJSON, b: BlockJSON): boolean {
  return (
    JSON.stringify(canonicalBlock(a)) === JSON.stringify(canonicalBlock(b))
  );
}

/** What becomes of one block of mine, given its base and theirs (null: not held). */
function outcomeOf(
  base: BlockJSON | null,
  mine: BlockJSON,
  theirs: BlockJSON | null,
): Outcome {
  if (base === null) {
    if (theirs === null) return { kind: "insert" };
    return isSame(mine, theirs) ? NOTHING : { kind: "replace", block: mine };
  }
  if (isSame(mine, base)) return NOTHING;
  if (theirs === null) return { kind: "set_aside" };
  if (isSame(theirs, base)) return { kind: "replace", block: mine };
  if (isSame(mine, theirs)) return NOTHING;
  const merged = mergeBlock(base, mine, theirs);
  if (!merged.ok) return { kind: "overlap", theirs };
  return isSame(merged.block, theirs)
    ? NOTHING
    : { kind: "replace", block: merged.block };
}

function writtenId(op: BlockOp): string | null {
  return op.op === "delete" ? op.id : idOf(op.block);
}

/**
 * Mine's changes against base, applied to theirs block by block (matched by
 * ID, compared in canonical form). Positions follow theirs: a block mine only
 * moved is not moved. A block of base that mine no longer holds is deleted
 * only when theirs holds it unchanged.
 */
export function mergeByBlock(
  base: DocJSON,
  mine: DocJSON,
  theirs: DocJSON,
): BlockMerge {
  const [baseById, theirsById] = [byId(base), byId(theirs)];
  const ops: BlockOp[] = [];
  const overlaps: Overlap[] = [];
  const setAside: SetAsideBlock[] = [];
  const mineIds = new Set(blocksIn(mine).map(idOf));
  let anchor: string | null = null;
  for (const block of blocksIn(mine)) {
    const id = idOf(block);
    if (id === null) {
      ops.push({ op: "insert", after: anchor, block });
      continue;
    }
    const outcome = outcomeOf(
      baseById.get(id) ?? null,
      block,
      theirsById.get(id) ?? null,
    );
    switch (outcome.kind) {
      case "nothing":
        break;
      case "insert":
        ops.push({ op: "insert", after: anchor, block });
        break;
      case "replace":
        ops.push({ op: "replace", block: outcome.block });
        break;
      case "set_aside":
        setAside.push({
          blockId: id,
          nearBlockId: anchor,
          text: textOf(block),
        });
        break;
      case "overlap":
        overlaps.push({ blockId: id, mine: block, theirs: outcome.theirs });
        break;
      default:
        outcome satisfies never;
    }
    if (outcome.kind === "insert" || theirsById.has(id)) anchor = id;
  }
  for (const [id, block] of baseById) {
    const kept = theirsById.get(id);
    if (!mineIds.has(id) && kept !== undefined && isSame(kept, block))
      ops.push({ op: "delete", id });
  }
  return {
    ops,
    overlaps,
    setAside,
    applied: new Set(ops.map(writtenId)).size,
    result: applyBlockOpsToJSON(theirs, ops),
  };
}

/**
 * theirs: the frozen final content of each generation after base's, oldest
 * first, then the current document. Step i merges (base_i, mine_i, theirs[i]),
 * with base_0 = base, mine_0 = mine, base_i = theirs[i − 1], mine_i =
 * result_{i−1}; the answer holds the last step's ops, applied and result, and
 * every step's overlaps and set-aside text. RangeError for [].
 */
export function mergeThrough(
  base: DocJSON,
  mine: DocJSON,
  theirs: readonly DocJSON[],
): BlockMerge {
  const [first, ...later] = theirs;
  if (first === undefined)
    throw new RangeError(
      "a merge is carried through at least 1 later document, not 0",
    );
  let step = mergeByBlock(base, mine, first);
  const overlaps = [...step.overlaps];
  const setAside = [...step.setAside];
  let previous = first;
  for (const next of later) {
    step = mergeByBlock(previous, step.result, next);
    overlaps.push(...step.overlaps);
    setAside.push(...step.setAside);
    previous = next;
  }
  return { ...step, overlaps, setAside };
}
