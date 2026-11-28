// Book manuscript footnotes (inline mark) and chapter word-count targets, each written in one undo step.
import {
  CHAPTER_TARGET_WORDS_MAX,
  CHAPTER_TARGET_WORDS_MIN,
  schema,
} from "@manent/schema";
import type { IdSource } from "@manent/schema";
import type { EditorState, Transaction } from "prosemirror-state";
import type { ActionEntry, ActionResult } from "./action-types.ts";

const WORD_CHAR = /\S/;

/** Finds the position of block `blockId`, or null when absent. */
function positionOf(state: EditorState, blockId: string): number | null {
  let found: number | null = null;
  state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isTextblock) return true;
    if (node.attrs.id === blockId) found = pos;
    return false;
  });
  return found;
}

/** Clamps a positive integer chapter word target, or returns null to clear. */
function normalizeTargetWords(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < CHAPTER_TARGET_WORDS_MIN) return null;
  return Math.min(CHAPTER_TARGET_WORDS_MAX, rounded);
}

/** Sets or clears `targetWords` on a chapter heading in one undo step. */
export function setChapterTarget(
  state: EditorState,
  blockId: string,
  targetWords: number | null,
  dispatch: (tr: Transaction) => void,
): ActionResult {
  const at = positionOf(state, blockId);
  const next = normalizeTargetWords(targetWords);
  if (at === null || state.doc.nodeAt(at)?.attrs.targetWords === next)
    return { ok: false, reason: "nothing_to_do" };
  dispatch(state.tr.setNodeAttribute(at, "targetWords", next));
  return { ok: true };
}

/** Finds the contiguous range of an existing footnote `id` within `$from.parent`. */
function existingFootnoteRange(
  state: EditorState,
  footnoteId: string,
): { from: number; to: number } | null {
  const { $from } = state.selection;
  if (!$from.parent.isTextblock) return null;
  const blockStart = $from.start();
  let from = -1;
  let to = -1;
  $from.parent.forEach((child, offset) => {
    const has = child.marks.some(
      (mark) =>
        mark.type === schema.marks.footnote && mark.attrs.id === footnoteId,
    );
    if (!has) return;
    const start = blockStart + offset;
    const end = start + child.nodeSize;
    if (from === -1) from = start;
    to = end;
  });
  return from === -1 ? null : { from, to };
}

/** Resolves a non-empty anchor span inside the current textblock when the caret is collapsed. */
function collapsedAnchorSpan(
  state: EditorState,
): { from: number; to: number } | null {
  const { $from } = state.selection;
  if (!$from.parent.isTextblock) return null;
  const text = $from.parent.textContent;
  if (text.length === 0) return null;
  const blockStart = $from.start();
  let end = $from.parentOffset;
  while (end > 0 && !WORD_CHAR.test(text[end - 1]!)) end--;
  if (end > 0) {
    let start = end;
    while (start > 0 && WORD_CHAR.test(text[start - 1]!)) start--;
    return { from: blockStart + start, to: blockStart + end };
  }
  let start = $from.parentOffset;
  while (start < text.length && !WORD_CHAR.test(text[start]!)) start++;
  if (start >= text.length) return null;
  let right = start;
  while (right < text.length && WORD_CHAR.test(text[right]!)) right++;
  return { from: blockStart + start, to: blockStart + right };
}

/**
 * Sets, updates or removes an inline manuscript `footnote` mark at the caret or selection.
 * Passing `text === null` or blank text removes the active footnote.
 */
export function setFootnote(
  state: EditorState,
  text: string | null,
  ids: IdSource,
  dispatch: (tr: Transaction) => void,
): ActionResult {
  const { $from, $to, empty } = state.selection;
  if (!$from.parent.isTextblock) return { ok: false, reason: "nothing_to_do" };
  const active =
    $from.marks().find((mark) => mark.type === schema.marks.footnote) ??
    (empty && $from.nodeBefore?.isText
      ? $from.nodeBefore.marks.find(
          (mark) => mark.type === schema.marks.footnote,
        )
      : undefined);
  const existingId =
    active !== undefined && typeof active.attrs.id === "string"
      ? active.attrs.id
      : null;
  const trimmed = text?.trim() ?? "";

  if (trimmed === "") {
    if (existingId === null) return { ok: false, reason: "nothing_to_do" };
    const range = existingFootnoteRange(state, existingId);
    if (range === null) return { ok: false, reason: "nothing_to_do" };
    dispatch(state.tr.removeMark(range.from, range.to, schema.marks.footnote));
    return { ok: true };
  }

  if (existingId !== null) {
    const range = existingFootnoteRange(state, existingId);
    if (range === null) return { ok: false, reason: "nothing_to_do" };
    const mark = schema.marks.footnote.create({
      id: existingId,
      text: trimmed,
    });
    const tr = state.tr
      .removeMark(range.from, range.to, schema.marks.footnote)
      .addMark(range.from, range.to, mark)
      .removeStoredMark(schema.marks.footnote);
    dispatch(tr);
    return { ok: true };
  }

  let from: number;
  let to: number;
  if (!empty) {
    from = $from.pos;
    to = $from.parent === $to.parent ? $to.pos : $from.end();
    if (from >= to) return { ok: false, reason: "nothing_to_do" };
  } else {
    const span = collapsedAnchorSpan(state);
    if (span === null) return { ok: false, reason: "nothing_to_do" };
    from = span.from;
    to = span.to;
  }

  const mark = schema.marks.footnote.create({ id: ids(), text: trimmed });
  const tr = state.tr
    .addMark(from, to, mark)
    .removeStoredMark(schema.marks.footnote);
  dispatch(tr);
  return { ok: true };
}

export const chapterTargetEntry: ActionEntry<{
  kind: "chapter_target";
  blockId: string;
  targetWords: number | null;
}> = {
  readOnly: false,
  run: (view, action) =>
    setChapterTarget(
      view.state,
      action.blockId,
      action.targetWords,
      view.dispatch,
    ),
};

export const footnoteEntry: ActionEntry<{
  kind: "footnote";
  text: string | null;
}> = {
  readOnly: false,
  run: (view, action, context) =>
    setFootnote(view.state, action.text, context.ids, view.dispatch),
};
