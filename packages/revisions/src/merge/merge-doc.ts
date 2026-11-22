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

/**
 * The text of a block mine changed and theirs no longer holds, or of a later
 * block of mine under an ID an earlier one holds.
 */
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
const SET_ASIDE: Outcome = Object.freeze({ kind: "set_aside" });

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

function spelling(block: BlockJSON): string {
  return JSON.stringify(canonicalBlock(block));
}

function isSame(a: BlockJSON, b: BlockJSON): boolean {
  return spelling(a) === spelling(b);
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
  if (theirs === null) return SET_ASIDE;
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

/** What a merge has found so far. */
type Found = Pick<BlockMerge, "ops" | "overlaps" | "setAside">;

/** One block's outcome added to what the merge has found; `anchor` is the block it follows. */
function record(
  found: Found,
  outcome: Outcome,
  block: BlockJSON,
  blockId: string,
  anchor: string | null,
): void {
  switch (outcome.kind) {
    case "nothing":
      break;
    case "insert":
      found.ops.push({ op: "insert", after: anchor, block });
      break;
    case "replace":
      found.ops.push({ op: "replace", block: outcome.block });
      break;
    case "set_aside":
      found.setAside.push({
        blockId,
        nearBlockId: anchor,
        text: textOf(block),
      });
      break;
    case "overlap":
      found.overlaps.push({ blockId, mine: block, theirs: outcome.theirs });
      break;
    default:
      outcome satisfies never;
  }
}

/**
 * Mine's changes against base, applied to theirs block by block (matched by
 * ID, compared in canonical form). Positions follow theirs: a block mine only
 * moved is not moved. A block of base that mine no longer holds is deleted
 * only when theirs holds it unchanged. Only mine's first block of an ID is
 * matched, as two devices splitting one block at once may leave an ID twice:
 * a later one is never written, and its text is set aside unless base or
 * theirs holds that block as it is.
 */
export function mergeByBlock(
  base: DocJSON,
  mine: DocJSON,
  theirs: DocJSON,
): BlockMerge {
  const [baseById, theirsById] = [byId(base), byId(theirs)];
  const found: Found = { ops: [], overlaps: [], setAside: [] };
  const mineIds = new Set<string>();
  let held: Set<string> | null = null;
  let anchor: string | null = null;
  for (const block of blocksIn(mine)) {
    const id = idOf(block);
    if (id === null) {
      found.ops.push({ op: "insert", after: anchor, block });
      continue;
    }
    if (mineIds.has(id)) {
      held ??= new Set([...blocksIn(base), ...blocksIn(theirs)].map(spelling));
      if (!held.has(spelling(block)))
        record(found, SET_ASIDE, block, id, anchor);
      continue;
    }
    mineIds.add(id);
    const outcome = outcomeOf(
      baseById.get(id) ?? null,
      block,
      theirsById.get(id) ?? null,
    );
    record(found, outcome, block, id, anchor);
    if (outcome.kind === "insert" || theirsById.has(id)) anchor = id;
  }
  for (const [id, block] of baseById) {
    const kept = theirsById.get(id);
    if (!mineIds.has(id) && kept !== undefined && isSame(kept, block))
      found.ops.push({ op: "delete", id });
  }
  return {
    ...found,
    applied: new Set(found.ops.map(writtenId)).size,
    result: applyBlockOpsToJSON(theirs, found.ops),
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
