// What a viewer receives: the script body as blocks, never a CRDT document.
import { canonicalDoc } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";

/** A reader ignores keys it does not know; changing a key raises this. */
export const VIEW_FORMAT_VERSION = 1;

/**
 * The script body, flattened, in order: blocks in the canonical form and
 * nothing else.
 */
export interface ViewSnapshot {
  v: 1;
  blocks: BlockJSON[];
}

/**
 * Applied in this order: `remove` (block ids), then `insert` in order (`after`
 * null is the very start), then `update`, which replaces the block with the
 * same id.
 */
export interface ViewPatch {
  v: 1;
  remove: string[];
  insert: { block: BlockJSON; after: string | null }[];
  update: BlockJSON[];
}

/** What one committed change did to the script body's blocks. */
export interface BlockChanges {
  inserted: readonly { block: BlockJSON; after: string | null }[];
  changed: readonly BlockJSON[];
  removed: readonly string[];
}

export function viewSnapshot(doc: DocJSON): ViewSnapshot {
  const sections = canonicalDoc(doc).content ?? [];
  return { v: 1, blocks: sections.flatMap((section) => section.content ?? []) };
}

/**
 * Null when nothing a viewer sees changed. A block that is new is inserted,
 * never also updated.
 */
export function viewPatch(changes: BlockChanges): ViewPatch | null {
  const insertedIds = new Set(
    changes.inserted.map(({ block }) => block.attrs?.id),
  );
  const update = changes.changed.filter(
    (block) => !insertedIds.has(block.attrs?.id),
  );
  if (
    changes.removed.length === 0 &&
    changes.inserted.length === 0 &&
    update.length === 0
  )
    return null;
  return {
    v: 1,
    remove: [...changes.removed],
    insert: [...changes.inserted],
    update,
  };
}

/** The UTF-8 bytes of the value's JSON text. */
export function encodeView(value: ViewSnapshot | ViewPatch): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
