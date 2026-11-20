// Which blocks of the current script are revised against a baseline, and how: derived, never stored in the text.
import { blockText, blockView, canonicalBlock } from "@manent/schema";
import type { BlockJSON, BlockView, FlatBlock } from "@manent/schema";
import { idOf } from "../compare/align.ts";
import { compareBlock } from "../compare/block-changes.ts";
import { AUTHORITY_ATTRS } from "../restore/plan-restore.ts";
import type { RevisionColour } from "./colours.ts";

/** A block marked revised as a whole, or by the UTF-16 ranges inserted and the offsets where text was deleted. */
export type BlockMark =
  | { readonly kind: "whole" }
  | {
      readonly kind: "ranges";
      readonly inserted: readonly (readonly [number, number])[];
      readonly deletedAt: readonly number[];
    };

/** The version marks are measured against: its blocks by id, the ids of the blocks it shows, and each id's place in its order. */
export interface Baseline {
  readonly blocks: ReadonlyMap<string, BlockJSON>;
  readonly visible: ReadonlySet<string>;
  readonly order: ReadonlyMap<string, number>;
}

/** A person's choice for one block: `marked` marks it whole; `cleared` unmarks it while its content still hashes to `hash`. */
export type Override =
  | { readonly kind: "marked" }
  | { readonly kind: "cleared"; readonly hash: string };

/** One revision as a page draws it; `day` is YYYY-MM-DD and `marks` is by block id. */
export interface RevisionSource {
  readonly ordinal: number;
  readonly name: string;
  readonly colour: RevisionColour;
  readonly mark: string;
  readonly day: string;
  readonly fullDraft: boolean;
  readonly marks: ReadonlyMap<string, BlockMark>;
}

const WHOLE: BlockMark = Object.freeze({ kind: "whole" });
const MARKED: Override = Object.freeze({ kind: "marked" });
const CLEARED = /^cleared@([0-9a-f]{8})$/;
// A block's identity and what the authority writes into it at issue and omit, which change no content.
const UNHASHED: ReadonlySet<string> = new Set(["id", "num", "omitted"]);
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

interface Placed {
  readonly id: string | null;
  readonly type: unknown;
  readonly omitted: boolean;
}

function isNumberedHeading(type: unknown): boolean {
  return type === "scene_heading" || type === "slug";
}

/** The ids of every block that is not an omitted heading and does not follow one before the next heading. */
function visibleIds(blocks: Iterable<Placed>): Set<string> {
  const visible = new Set<string>();
  let hiding = false;
  for (const block of blocks) {
    if (isNumberedHeading(block.type)) hiding = block.omitted;
    if (!hiding && block.id !== null) visible.add(block.id);
  }
  return visible;
}

function placedJSON(block: BlockJSON): Placed {
  return {
    id: idOf(block),
    type: block.attrs?.type,
    omitted: block.attrs?.omitted === true,
  };
}

/** The block as its view holds it: mark names without their attributes, so that both sides of a comparison read alike. */
function viewJSON(view: BlockView): BlockJSON {
  return canonicalBlock({
    type: "block",
    attrs: { ...view.attrs },
    content: view.runs.map((run) => ({
      type: "text",
      text: run.text,
      marks: run.marks.map((type) => ({ type })),
    })),
  });
}

function isAuthorityAttr(key: string): boolean {
  return AUTHORITY_ATTRS.some((name) => name === key);
}

/** A whole mark wins; ranges are joined, each deletion offset once, ascending. */
function joinMarks(a: BlockMark | undefined, b: BlockMark): BlockMark {
  if (a === undefined) return b;
  if (a.kind === "whole" || b.kind === "whole") return WHOLE;
  return {
    kind: "ranges",
    inserted: [...a.inserted, ...b.inserted],
    deletedAt: [...new Set([...a.deletedAt, ...b.deletedAt])].toSorted(
      (x, y) => x - y,
    ),
  };
}

/** The baseline of a version's blocks, as `VersionContent.blocks` holds them. */
export function baselineOf(blocks: readonly BlockJSON[]): Baseline {
  const byId = new Map<string, BlockJSON>();
  const order = new Map<string, number>();
  blocks.forEach((block, i) => {
    const id = idOf(block);
    if (id === null || byId.has(id)) return;
    byId.set(id, block);
    order.set(id, i);
  });
  return { blocks: byId, visible: visibleIds(blocks.map(placedJSON)), order };
}

/** FNV-1a 32-bit, as 8 lower-case hex digits, of the UTF-8 of the canonical block without `id`, `num` and `omitted`. */
export function contentHash(block: BlockJSON): string {
  const canonical = canonicalBlock(block);
  const attrs = Object.fromEntries(
    Object.entries(canonical.attrs ?? {}).filter(([key]) => !UNHASHED.has(key)),
  );
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(
    JSON.stringify({ ...canonical, attrs }),
  ))
    hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

/** An override as the script's map stores it, "marked" or "cleared@<8 hex>"; null for anything else. */
export function parseOverride(value: unknown): Override | null {
  if (value === "marked") return MARKED;
  if (typeof value !== "string") return null;
  const hash = CLEARED.exec(value)?.[1];
  return hash === undefined ? null : { kind: "cleared", hash };
}

/** "<setId>:<blockId>": the key of a block's override in the script's map. */
export function overrideKey(setId: string, blockId: string): string {
  return `${setId}:${blockId}`;
}

/**
 * How `current` is revised against its baseline block `base` (null: the
 * baseline lacks it); null when it is not. An override decides first; an
 * added, omitted, brought-back or moved block, or one whose element or layout
 * changed, is marked whole; a change to `num` or `omitted` alone marks nothing.
 */
export function markBlock(
  base: BlockJSON | null,
  current: BlockJSON,
  facts: {
    baseVisible: boolean;
    visible: boolean;
    moved: boolean;
    override: Override | null;
  },
): BlockMark | null {
  const { override } = facts;
  if (override?.kind === "marked") return WHOLE;
  if (override?.kind === "cleared" && override.hash === contentHash(current))
    return null;
  if (base === null || facts.visible !== facts.baseVisible || facts.moved)
    return WHOLE;
  const change = compareBlock(base, current, "full");
  if (change === null) return null;
  if (change.attrs.some((key) => !isAuthorityAttr(key))) return WHOLE;
  if (change.inline.length === 0) return null;
  return {
    kind: "ranges",
    inserted: change.inline
      .filter((found) => found.kind !== "deleted")
      .map((found) => [found.offset, found.offset + found.length] as const),
    deletedAt: change.inline
      .filter((found) => found.kind === "deleted")
      .map((found) => found.offset),
  };
}

/**
 * Where each removed baseline block is marked: the first line of the next
 * baseline block that survives and is visible in `current`, or else the last
 * line of the one before it. Several removals at one point mark it once.
 */
export function removedMarks(
  baseline: Baseline,
  current: readonly FlatBlock[],
  removedIds: readonly string[],
): Map<string, BlockMark> {
  const visible = visibleIds(current.map((block) => block.attrs));
  const lengths = new Map(
    current.map((block) => [block.attrs.id, blockText(block).length]),
  );
  const inOrder: string[] = [];
  for (const [id, i] of baseline.order) inOrder[i] = id;
  const marks = new Map<string, BlockMark>();
  const markAt = (id: string, offset: number) =>
    marks.set(
      id,
      joinMarks(marks.get(id), {
        kind: "ranges",
        inserted: [],
        deletedAt: [offset],
      }),
    );
  for (const removed of removedIds) {
    const at = baseline.order.get(removed);
    if (at === undefined) continue;
    const next = inOrder.slice(at + 1).find((id) => visible.has(id));
    const before = inOrder.slice(0, at).findLast((id) => visible.has(id));
    if (next !== undefined) markAt(next, 0);
    else if (before !== undefined) markAt(before, lengths.get(before) ?? 0);
  }
  return marks;
}

/**
 * The marks of the whole current script against `baseline`: each block's
 * markBlock, with `moved` from compareDocs, joined with the marks of the
 * baseline blocks it no longer holds. Both sides are read as their views
 * hold them, mark names without attributes.
 */
export function liveMarks(
  baseline: Baseline,
  current: readonly FlatBlock[],
  moved: ReadonlySet<string>,
  override: (blockId: string) => Override | null,
): Map<string, BlockMark> {
  const visible = visibleIds(current.map((block) => block.attrs));
  const marks = new Map<string, BlockMark>();
  const present = new Set<string>();
  for (const block of current) {
    const id = block.attrs.id;
    if (id === null) continue;
    present.add(id);
    const base = baseline.blocks.get(id);
    const mark = markBlock(
      base === undefined ? null : viewJSON(blockView(base)),
      viewJSON(block),
      {
        baseVisible: baseline.visible.has(id),
        visible: visible.has(id),
        moved: moved.has(id),
        override: override(id),
      },
    );
    if (mark !== null) marks.set(id, mark);
  }
  const removed = [...baseline.blocks.keys()].filter((id) => !present.has(id));
  for (const [id, mark] of removedMarks(baseline, current, removed))
    marks.set(id, joinMarks(marks.get(id), mark));
  return marks;
}
