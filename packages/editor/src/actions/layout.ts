// A block's own layout, set on every block the selection touches.
import { schema } from "@manent/schema";
import type { Alignment, BlockAttrs } from "@manent/schema";
import type { LayoutBlock } from "@manent/pagination";
import type { Node } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import { blockAt, updateIndex } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type {
  PaginationSettings,
  PaginationState,
} from "../pagination/plugin.ts";
import type { ActionEntry, ActionResult } from "./action-types.ts";

/** The most blank lines a block's own space before may ask for, as the engine clamps it; for a script without pages. */
const MAX_SPACE_BEFORE = 10;

type BlockChange = Partial<Record<keyof BlockAttrs, unknown>>;

/**
 * Gives every block the selection touches the attributes `change` returns for
 * it from its attributes and its position, in one transaction, leaving a block
 * that already has them untouched. True when a block changed.
 */
export function changeSelectedBlocks(
  state: EditorState,
  change: (
    attrs: Readonly<Record<string, unknown>>,
    pos: number,
  ) => BlockChange,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const tr = state.tr;
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type !== schema.nodes.block) return true;
    const changed = change(node.attrs, pos);
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

const LAYOUT_FIELDS = ["indent", "width", "spaceBefore"] as const;
type LayoutField = (typeof LAYOUT_FIELDS)[number];
/** A field left out is unchanged, and null returns it to the element's own. */
type LayoutAction = {
  kind: "layout";
  indent?: number | null;
  width?: number | null;
  align?: Alignment | null;
  spaceBefore?: number | null;
};

/** Without a page there is no column, so only space before has a ceiling. */
const INK_BOUNDS: Readonly<Record<LayoutField, readonly [number, number]>> = {
  indent: [0, Infinity],
  width: [1, Infinity],
  spaceBefore: [0, MAX_SPACE_BEFORE],
};

/** The fields `layout` gives: a number stored as `drawn` gives it, null returning the field to the element's. */
function storedLayout(
  layout: LayoutAction,
  drawn: (field: LayoutField, value: number) => number,
): BlockChange {
  const change: BlockChange = {};
  for (const field of LAYOUT_FIELDS) {
    const value = layout[field];
    if (value !== undefined)
      change[field] = value === null ? null : drawn(field, value);
  }
  if (layout.align !== undefined) change.align = layout.align;
  return change;
}

/** The fields `layout` gives, floored and kept inside `INK_BOUNDS`. */
const inkLayout = (layout: LayoutAction): BlockChange =>
  storedLayout(layout, (field, value) => {
    const [low, high] = INK_BOUNDS[field];
    return Math.min(high, Math.max(low, Math.floor(value)));
  });

/** The fields `layout` gives, as the page's engine resolves them for `block` once they are set on it. */
function pagedLayout(
  layout: LayoutAction,
  block: LayoutBlock,
  settings: PaginationSettings,
): BlockChange {
  const own = (field: LayoutField): number | null => {
    const value = layout[field];
    return value === undefined ? block[field] : value;
  };
  const spec = settings.engine.resolveSpec(settings.profile, {
    ...block,
    indent: own("indent"),
    width: own("width"),
    spaceBefore: own("spaceBefore"),
  });
  return storedLayout(layout, (field) => spec[field]);
}

/** What `layout` stores on each block of a page, from the page's blocks as `doc` holds them. */
function pagedChange(
  layout: LayoutAction,
  pages: PaginationState,
  doc: Node,
): (attrs: Readonly<Record<string, unknown>>, pos: number) => BlockChange {
  // During a composition the plugin keeps the blocks from before it.
  const { index } = updateIndex(pages.index, doc, pages.settings.layout);
  return (_, pos) =>
    pagedLayout(layout, index.blocks[blockAt(index, pos + 1)]!, pages.settings);
}

/**
 * Sets the layout fields given on every selected block; null returns a field to the element's.
 * On a page each value is stored as the engine draws it; without one (Ink) it is floored,
 * and only space before is clamped.
 */
export function setLayout(
  state: EditorState,
  layout: LayoutAction,
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  const pages = paginationKey.getState(state);
  const change =
    pages === undefined
      ? () => inkLayout(layout)
      : pagedChange(layout, pages, state.doc);
  return changeSelectedBlocks(state, change, dispatch)
    ? { ok: true }
    : { ok: false, reason: "nothing_to_do" };
}

/** Toggles. */
export const alignEntry: ActionEntry<{ kind: "align"; value: Alignment }> = {
  readOnly: false,
  run: (view, action) => toggleAlign(view.state, action.value, view.dispatch),
};

/** Toggles. */
export const spaceBeforeEntry: ActionEntry<{ kind: "space_before" }> = {
  readOnly: false,
  run: (view) => toggleSpaceBefore(view.state, view.dispatch),
};

export const layoutEntry: ActionEntry<LayoutAction> = {
  readOnly: false,
  run: (view, action) => setLayout(view.state, action, view.dispatch),
};
