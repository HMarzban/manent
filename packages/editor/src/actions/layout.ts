// A block's own layout, set on every block the selection touches.
import { schema } from "@manent/schema";
import type { Alignment, BlockAttrs } from "@manent/schema";
import type { EditorState, Transaction } from "prosemirror-state";
import type { ActionResult, EditorAction } from "./action-types.ts";

/** The most blank lines a block's own space before may ask for, as the engine clamps it. */
const MAX_SPACE_BEFORE = 10;

type BlockChange = Partial<Record<keyof BlockAttrs, unknown>>;

/**
 * Gives every block the selection touches the attributes `change` returns for
 * it, in one transaction, leaving a block that already has them untouched.
 * True when a block changed.
 */
export function changeSelectedBlocks(
  state: EditorState,
  change: (attrs: Readonly<Record<string, unknown>>) => BlockChange,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const tr = state.tr;
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type !== schema.nodes.block) return true;
    const changed = change(node.attrs);
    if (
      Object.entries(changed).some(([key, value]) => node.attrs[key] !== value)
    )
      tr.setNodeMarkup(pos, null, { ...node.attrs, ...changed });
    return false;
  });
  if (!tr.docChanged) return false;
  dispatch?.(tr);
  return true;
}

/** Each selected block takes `value`, or returns to its element's alignment when it has `value` already. */
export function toggleAlign(
  state: EditorState,
  value: Alignment,
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  changeSelectedBlocks(
    state,
    (attrs) => ({ align: attrs.align === value ? null : value }),
    dispatch,
  );
  return { ok: true };
}

/** A selected block with its own space before returns to its element's; the others get one blank line. */
export function toggleSpaceBefore(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  changeSelectedBlocks(
    state,
    (attrs) => ({ spaceBefore: attrs.spaceBefore === null ? 1 : null }),
    dispatch,
  );
  return { ok: true };
}

const fit = (value: number | null, low: number, high: number): number | null =>
  value === null ? null : Math.min(high, Math.max(low, Math.floor(value)));

/**
 * The fields `layout` gives, floored and clamped as the engine clamps them to a
 * column of `columnCells` (null: no page, so no column), so that what is stored
 * is what is drawn. A width is clamped against the block's own indent, or 0
 * when it has none.
 */
function drawnLayout(
  layout: Extract<EditorAction, { kind: "layout" }>,
  attrs: Readonly<Record<string, unknown>>,
  columnCells: number | null,
): BlockChange {
  const column = columnCells ?? Infinity;
  const change: BlockChange = {};
  if (layout.indent !== undefined)
    change.indent = fit(layout.indent, 0, column - 1);
  if (layout.width !== undefined) {
    const indent = change.indent === undefined ? attrs.indent : change.indent;
    const kept = typeof indent === "number" ? indent : 0;
    change.width = fit(layout.width, 1, column - kept);
  }
  if (layout.align !== undefined) change.align = layout.align;
  if (layout.spaceBefore !== undefined)
    change.spaceBefore = fit(layout.spaceBefore, 0, MAX_SPACE_BEFORE);
  return change;
}

/** Sets the layout fields given on every selected block; null returns a field to the element's. */
export function setLayout(
  state: EditorState,
  layout: Extract<EditorAction, { kind: "layout" }>,
  columnCells: number | null,
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  return changeSelectedBlocks(
    state,
    (attrs) => drawnLayout(layout, attrs, columnCells),
    dispatch,
  )
    ? { ok: true }
    : { ok: false, reason: "nothing_to_do" };
}
