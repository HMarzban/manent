// Enter, Backspace and Delete, none of which moves a block into another section.
import {
  DEFAULT_BLOCK_ATTRS,
  SECTION_TARGET_BLOCKS,
  attrsAfterJoin,
  attrsForNewBlock,
  attrsForSplitTail,
  randomBlockId,
  schema,
} from "@manent/schema";
import type { BlockAttrs, IdSource } from "@manent/schema";
import type { Node, ResolvedPos } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import { deleteRangeKeepingSections } from "./delete-range.ts";

export const ENTER_PLACES = ["start", "end", "middle", "empty"] as const;
export type EnterPlace = (typeof ENTER_PLACES)[number];

/** An element as a block holds it: `kind` is set on an act break only. */
type ElementAttrs = Pick<BlockAttrs, "type" | "kind">;

/** The element of the block Enter creates, from the block the caret is in and where in it the caret is. */
export type NextElement = (
  current: BlockAttrs,
  place: EnterPlace,
) => ElementAttrs;

/** The new block has the element of the block Enter was pressed in. */
export const sameElement: NextElement = (current) => ({
  type: current.type,
  kind: current.kind,
});

function newBlockAttrs(element: ElementAttrs, id: string): BlockAttrs {
  return { ...attrsForNewBlock(element.type, id), kind: element.kind };
}

export interface SectionOptions {
  readonly ids?: IdSource;
  readonly nextElement?: NextElement;
}

// The block node declares every attribute with a default, so its attrs hold every key.
function attrsOf(block: Node): BlockAttrs {
  return { ...DEFAULT_BLOCK_ATTRS, ...block.attrs };
}

function placeOf($caret: ResolvedPos): EnterPlace {
  if ($caret.parent.content.size === 0) return "empty";
  if ($caret.parentOffset === 0) return "start";
  return $caret.parentOffset === $caret.parent.content.size ? "end" : "middle";
}

/**
 * Inserts `block` after the block `$inside` is in: in its section, unless that
 * block ends a section holding SECTION_TARGET_BLOCKS or more, and then in a new
 * section after it. Returns the position at the start of the inserted block.
 */
function insertAfter(
  tr: Transaction,
  $inside: ResolvedPos,
  block: Node,
): number {
  const section = $inside.node(1);
  if (
    $inside.index(1) === section.childCount - 1 &&
    section.childCount >= SECTION_TARGET_BLOCKS
  ) {
    tr.insert($inside.after(1), schema.nodes.section.create(null, block));
    return $inside.after(1) + 2;
  }
  tr.insert($inside.after(2), block);
  return $inside.after(2) + 1;
}

// Enter at either end inserts a block rather than splitting, so the block that holds the text is never rewritten.
function enter(tr: Transaction, ids: IdSource, next: NextElement): Transaction {
  const $caret = tr.selection.$from;
  const current = attrsOf($caret.parent);
  const place = placeOf($caret);
  if (place === "start") {
    const block = schema.nodes.block.create(
      newBlockAttrs(next(current, place), ids()),
    );
    tr.insert($caret.before(2), block);
    return tr.setSelection(
      TextSelection.create(tr.doc, $caret.pos + block.nodeSize),
    );
  }
  if (place === "middle") {
    const id = ids();
    const element = next(current, place);
    const tail = schema.nodes.block.create(
      {
        ...attrsForSplitTail(current, element.type, id, ids().slice(0, 6)),
        kind: element.kind,
      },
      $caret.parent.content.cut($caret.parentOffset),
    );
    tr.delete($caret.pos, $caret.end());
    const at = insertAfter(tr, tr.doc.resolve($caret.pos), tail);
    return tr.setSelection(TextSelection.create(tr.doc, at));
  }
  const at = insertAfter(
    tr,
    $caret,
    schema.nodes.block.create(newBlockAttrs(next(current, place), ids())),
  );
  return tr.setSelection(TextSelection.create(tr.doc, at));
}

/**
 * Enter: a new empty block after the caret's block at its end or in an empty
 * block, before it at its start, and in its middle a new block after it that
 * takes the text after the caret. The caret moves into the new block, or stays
 * at the start of the block that holds the text. A selection is deleted
 * keeping sections first.
 */
export function sectionEnter(options: SectionOptions = {}): Command {
  const ids = options.ids ?? randomBlockId;
  const next = options.nextElement ?? sameElement;
  return (state, dispatch) => {
    const tr = state.tr;
    if (!state.selection.empty)
      deleteRangeKeepingSections(tr, state.selection.from, state.selection.to);
    dispatch?.(enter(tr, ids, next).scrollIntoView());
    return true;
  };
}

/**
 * Joins the block `$later` is in to the block before it, in its section or the
 * one before; the earlier block takes the attributes attrsAfterJoin gives it.
 */
function joinBackward(
  state: EditorState,
  $later: ResolvedPos,
  dispatch?: (tr: Transaction) => void,
): void {
  const first = $later.index(1) === 0;
  const joinAt = first ? $later.before(1) - 2 : $later.before(2) - 1;
  const $join = state.doc.resolve(joinAt);
  const alone = $later.node(1).childCount === 1;
  const tr = state.tr
    .delete(
      alone ? $later.before(1) : $later.before(2),
      alone ? $later.after(1) : $later.after(2),
    )
    .insert(joinAt, $later.parent.content)
    .setNodeMarkup(
      $join.before(2),
      null,
      attrsAfterJoin(attrsOf($join.parent), attrsOf($later.parent)).attrs,
    );
  dispatch?.(
    tr.setSelection(TextSelection.create(tr.doc, joinAt)).scrollIntoView(),
  );
}

/** Backspace or Delete with a selection: it is deleted keeping sections. */
function deleteSelection(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  dispatch?.(
    deleteRangeKeepingSections(
      state.tr,
      state.selection.from,
      state.selection.to,
    ).scrollIntoView(),
  );
  return true;
}

/**
 * Backspace at a block's start joins it to the block before. In the
 * document's first block it changes nothing and is still handled; elsewhere
 * in a block it is left to ProseMirror.
 */
export function sectionBackspace(): Command {
  return (state, dispatch) => {
    if (!state.selection.empty) return deleteSelection(state, dispatch);
    const $caret = state.selection.$from;
    if ($caret.parentOffset > 0) return false;
    if ($caret.index(0) > 0 || $caret.index(1) > 0)
      joinBackward(state, $caret, dispatch);
    return true;
  };
}

/**
 * Delete at a block's end joins the block after to it. In the document's last
 * block it changes nothing and is still handled; elsewhere in a block it is
 * left to ProseMirror.
 */
export function sectionDelete(): Command {
  return (state, dispatch) => {
    if (!state.selection.empty) return deleteSelection(state, dispatch);
    const $caret = state.selection.$from;
    if ($caret.parentOffset < $caret.parent.content.size) return false;
    const last = $caret.index(1) === $caret.node(1).childCount - 1;
    if (!last || $caret.index(0) < state.doc.childCount - 1)
      joinBackward(
        state,
        state.doc.resolve(last ? $caret.after(1) + 2 : $caret.after(2) + 1),
        dispatch,
      );
    return true;
  };
}
