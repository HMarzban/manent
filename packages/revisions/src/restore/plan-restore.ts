// A restore as block operations: what turns the current document's scope into the target's, numbers kept.
import { canonicalBlock, fillBlockAttrs } from "@manent/schema";
import type { BlockJSON, BlockOp, DocJSON } from "@manent/schema";
import {
  canonicalBlocksOf,
  idOf,
  isSceneHeading,
  longestIncreasingSubsequence,
} from "../compare/align.ts";
import { applyBlockOpsToJSON } from "../merge/apply-ops.ts";
import { sceneBlocks } from "./scene-blocks.ts";

export type RestoreScope =
  { kind: "script" } | { kind: "scene"; headingId: string };

/** The attributes a restore never changes. */
export const AUTHORITY_ATTRS = ["num", "omitted"] as const;

/** What the authority holds for a block the current document lacks; null when it holds nothing. */
export type AuthorityValues = (
  blockId: string,
) => { readonly num: string | null; readonly omitted: boolean } | null;

export interface RestoreOptions {
  /** Absent: every block the current document lacks gets num null, omitted false. */
  readonly authority?: AuthorityValues;
  /** For a scene restore only: the id of a copy of a target block the current document holds outside the scene. */
  readonly newId: () => string;
}

export interface RestorePlan {
  readonly ops: readonly BlockOp[];
  /** The distinct blocks the ops write. */
  readonly applied: number;
  /** The current document with the ops applied. */
  readonly result: DocJSON;
}

interface Scoped {
  /** Every block of the current document, in order. */
  all: BlockJSON[];
  /** The current document's blocks in the scope, in order. */
  current: BlockJSON[];
  /** The target document's blocks in the scope, in order. */
  target: BlockJSON[];
  /** What the scope's first block is inserted after; null: the start. */
  anchor: string | null;
  /** The ids the current document holds outside the scope. */
  outside: Set<string>;
}

/**
 * Where a scene the current document lacks goes back: after the end of the
 * scene that holds the nearest earlier target block the current document
 * holds, so that no other scene gains a block.
 */
function anchorOfMissing(
  currentBlocks: BlockJSON[],
  targetBlocks: BlockJSON[],
  headingId: string,
): string | null {
  const held = new Map(currentBlocks.map((block, i) => [idOf(block), i]));
  const start = targetBlocks.findIndex((block) => idOf(block) === headingId);
  const before = targetBlocks
    .slice(0, start)
    .findLast((block) => held.has(idOf(block)));
  let at = before === undefined ? -1 : held.get(idOf(before))!;
  while (
    at + 1 < currentBlocks.length &&
    !isSceneHeading(currentBlocks[at + 1]!)
  )
    at++;
  return at === -1 ? null : idOf(currentBlocks[at]!);
}

function scopedOf(
  current: DocJSON,
  target: DocJSON,
  scope: RestoreScope,
): Scoped {
  const currentBlocks = canonicalBlocksOf(current);
  const targetBlocks = canonicalBlocksOf(target);
  if (scope.kind === "script")
    return {
      all: currentBlocks,
      current: currentBlocks,
      target: targetBlocks,
      anchor: null,
      outside: new Set(),
    };
  const inScene = new Set(sceneBlocks(current, scope.headingId));
  const inTarget = new Set(sceneBlocks(target, scope.headingId));
  const heading = currentBlocks.findIndex(
    (block) => idOf(block) === scope.headingId,
  );
  return {
    all: currentBlocks,
    current: currentBlocks.filter((block) => inScene.has(idOf(block) ?? "")),
    target: targetBlocks.filter((block) => inTarget.has(idOf(block) ?? "")),
    anchor:
      heading === -1
        ? anchorOfMissing(currentBlocks, targetBlocks, scope.headingId)
        : heading > 0
          ? idOf(currentBlocks[heading - 1]!)
          : null,
    outside: new Set(
      currentBlocks.flatMap((block) => {
        const id = idOf(block);
        return id === null || inScene.has(id) ? [] : [id];
      }),
    ),
  };
}

/** Each target block with the current number and omission of its id, or the authority's; a copy under a new id where the current document holds it outside the scope. */
function withAuthority(scoped: Scoped, options: RestoreOptions): BlockJSON[] {
  const held = new Map(scoped.all.map((block) => [idOf(block), block]));
  return scoped.target.flatMap((block) => {
    const id = idOf(block);
    if (id === null) return [];
    const now = held.get(id);
    const values =
      now === undefined
        ? (options.authority?.(id) ?? { num: null, omitted: false })
        : fillBlockAttrs(now.attrs);
    const attrs: Record<string, unknown> = { ...block.attrs };
    for (const key of AUTHORITY_ATTRS) attrs[key] = values[key];
    if (scoped.outside.has(id)) attrs.id = options.newId();
    return [canonicalBlock({ ...block, attrs })];
  });
}

/**
 * The operations that make the scope of `current` (the whole script, or the
 * scene of `headingId`) equal to the target's, keeping every block's number
 * and omission: deletes in document order, then moves' deletes, then inserts
 * and moves in target order, then replaces in target order. A block without
 * an id is passed over.
 */
export function planRestore(
  current: DocJSON,
  target: DocJSON,
  scope: RestoreScope,
  options: RestoreOptions,
): RestorePlan {
  const scoped = scopedOf(current, target, scope);
  const wanted = withAuthority(scoped, options);
  const wantedIds = new Set(wanted.map(idOf));
  const position = new Map(scoped.current.map((block, i) => [idOf(block), i]));
  const positions = wanted.flatMap((block) => position.get(idOf(block)) ?? []);
  const staying = new Set(
    longestIncreasingSubsequence(positions).map((k) => positions[k]!),
  );
  const deletes: BlockOp[] = scoped.current.flatMap((block) => {
    const id = idOf(block);
    return id === null || wantedIds.has(id) ? [] : [{ op: "delete", id }];
  });
  const moves: BlockOp[] = [];
  const inserts: BlockOp[] = [];
  const replaces: BlockOp[] = [];
  let after = scoped.anchor;
  for (const block of wanted) {
    const id = idOf(block)!;
    const at = position.get(id);
    if (at === undefined || !staying.has(at)) {
      if (at !== undefined) moves.push({ op: "delete", id });
      inserts.push({ op: "insert", after, block });
    } else if (JSON.stringify(scoped.current[at]) !== JSON.stringify(block))
      replaces.push({ op: "replace", block });
    after = id;
  }
  const ops = [...deletes, ...moves, ...inserts, ...replaces];
  const written = ops.map((op) =>
    op.op === "delete" ? op.id : idOf(op.block),
  );
  return {
    ops,
    applied: new Set(written).size,
    result: applyBlockOpsToJSON(current, ops),
  };
}
