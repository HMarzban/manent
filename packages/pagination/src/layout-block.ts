// What the engine reads of a block, and a caller's changes to it before it is measured.
import type { Alignment, Dual } from "@manent/schema";

/** Frozen; one per block. Its identity is what incremental pagination compares. */
export interface LayoutBlock {
  readonly id: string;
  /** As stored; an unknown type lays out as "general". */
  readonly type: string;
  readonly kind: string | null;
  /** One UTF-16 unit per document position inside the block. */
  readonly text: string;
  /** One STYLE byte per unit; null when no unit has a style. */
  readonly styles: Uint8Array | null;
  readonly dual: Dual | null;
  readonly num: string | null;
  readonly align: Alignment | null;
  readonly indent: number | null;
  readonly width: number | null;
  readonly spaceBefore: number | null;
  readonly noContd: boolean;
  readonly noTiming?: boolean;
}

/** A caller's change to one block before it is measured. */
export interface LayoutPatch {
  readonly type?: string;
  readonly text?: string;
  readonly num?: string | null;
}

/** Patches by block id; the key changes when the patches do. */
export interface LayoutPatches {
  readonly key: string;
  readonly patches: ReadonlyMap<string, LayoutPatch>;
}

/**
 * The blocks with each patch applied: a frozen copy where a patch applies, the same object elsewhere.
 * It changes the engine's input, never how the engine lays it out. A patch that sets the text drops the
 * block's styles, which belong to the text it replaces.
 */
export function applyLayoutPatches(
  blocks: readonly LayoutBlock[],
  layout: LayoutPatches | null,
): LayoutBlock[] {
  if (layout === null) return [...blocks];
  return blocks.map((block) => {
    const patch = layout.patches.get(block.id);
    if (patch === undefined) return block;
    const styles = patch.text === undefined ? block.styles : null;
    return Object.freeze({ ...block, ...patch, styles });
  });
}
