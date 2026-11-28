// Inline formatting: the style marks, named text colour and highlight, hyperlinks and clearing inline formatting.
import { schema } from "@manent/schema";
import { toggleMark } from "prosemirror-commands";
import type { EditorState, Transaction } from "prosemirror-state";
import type {
  ActionEntry,
  ActionResult,
  HighlightColour,
  StyleMark,
  TextColour,
} from "./action-types.ts";

const SAFE_LINK = /^(?:https?:\/\/|mailto:)/i;
const CLEARABLE_MARKS = [
  "bold",
  "italic",
  "underline",
  "strike",
  "caps",
  "sup",
  "sub",
  "color",
  "highlight",
  "link",
] as const;

export function toggleStyle(
  state: EditorState,
  mark: StyleMark,
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  const opposite = mark === "sup" ? "sub" : mark === "sub" ? "sup" : null;
  if (opposite === null) {
    return toggleMark(schema.marks[mark])(state, dispatch)
      ? { ok: true }
      : { ok: false, reason: "nothing_to_do" };
  }
  const type = schema.marks[mark];
  const oppType = schema.marks[opposite];
  const active = state.selection.empty
    ? Boolean(type.isInSet(state.storedMarks ?? state.selection.$from.marks()))
    : state.doc.rangeHasMark(state.selection.from, state.selection.to, type);
  const tr = state.tr;
  if (state.selection.empty) {
    if (active) tr.removeStoredMark(type);
    else {
      tr.removeStoredMark(oppType);
      tr.addStoredMark(type.create());
    }
  } else {
    for (const { $from, $to } of state.selection.ranges) {
      if (active) tr.removeMark($from.pos, $to.pos, type);
      else {
        tr.removeMark($from.pos, $to.pos, oppType);
        tr.addMark($from.pos, $to.pos, type.create());
      }
    }
  }
  if (tr.docChanged || tr.storedMarksSet) dispatch?.(tr);
  return { ok: true };
}

/**
 * Gives the selection the `color` or `highlight` mark with `value`, in place of
 * another value; null removes the mark. With an empty selection the stored
 * marks change instead.
 */
export function setNamedMark(
  state: EditorState,
  name: "color" | "highlight",
  value: string | null,
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  const type = schema.marks[name];
  const tr = state.tr;
  if (state.selection.empty) {
    if (value === null) tr.removeStoredMark(type);
    else tr.addStoredMark(type.create({ value }));
  } else {
    for (const { $from, $to } of state.selection.ranges) {
      if (value === null) tr.removeMark($from.pos, $to.pos, type);
      else tr.addMark($from.pos, $to.pos, type.create({ value }));
    }
  }
  if (tr.docChanged || tr.storedMarksSet) dispatch?.(tr);
  return { ok: true };
}

/**
 * Applies or removes the `link` mark (`http:`, `https:` or `mailto:`). Removing on a collapsed caret inside a linked
 * run strips the link across that contiguous linked span inside the block.
 */
export function setLink(
  state: EditorState,
  href: string | null,
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  const type = schema.marks.link;
  const trimmed = href === null ? "" : href.trim();
  if (trimmed !== "" && !SAFE_LINK.test(trimmed)) {
    return { ok: false, reason: "nothing_to_do" };
  }
  const tr = state.tr;
  if (state.selection.empty) {
    if (trimmed === "") {
      const { $from } = state.selection;
      const parentStart = $from.start();
      let spanStart: number | null = null;
      let spanEnd: number | null = null;
      const offset = $from.parentOffset;
      let cursor = 0;
      $from.parent.forEach((child) => {
        const next = cursor + child.nodeSize;
        const hasLink = child.marks.some((m) => m.type === type);
        if (hasLink && offset >= cursor && offset <= next) {
          spanStart = parentStart + cursor;
          spanEnd = parentStart + next;
        }
        cursor = next;
      });
      if (spanStart !== null && spanEnd !== null) {
        tr.removeMark(spanStart, spanEnd, type);
      }
      tr.removeStoredMark(type);
    } else {
      tr.addStoredMark(type.create({ href: trimmed }));
    }
  } else {
    for (const { $from, $to } of state.selection.ranges) {
      if (trimmed === "") tr.removeMark($from.pos, $to.pos, type);
      else tr.addMark($from.pos, $to.pos, type.create({ href: trimmed }));
    }
  }
  if (tr.docChanged || tr.storedMarksSet) dispatch?.(tr);
  return { ok: true };
}

/** Strips inline style, colour, highlight and link marks while preserving suggestion marks. */
export function clearFormatting(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  const tr = state.tr;
  if (state.selection.empty) {
    for (const name of CLEARABLE_MARKS) tr.removeStoredMark(schema.marks[name]);
  } else {
    for (const { $from, $to } of state.selection.ranges) {
      for (const name of CLEARABLE_MARKS) {
        tr.removeMark($from.pos, $to.pos, schema.marks[name]);
      }
    }
  }
  if (tr.docChanged || tr.storedMarksSet) dispatch?.(tr);
  return { ok: true };
}

export const styleEntry: ActionEntry<{ kind: "style"; mark: StyleMark }> = {
  readOnly: false,
  run: (view, action) => toggleStyle(view.state, action.mark, view.dispatch),
};

/** A value of null is None. */
export const colourEntry: ActionEntry<{
  kind: "colour";
  value: TextColour | null;
}> = {
  readOnly: false,
  run: (view, action) =>
    setNamedMark(view.state, "color", action.value, view.dispatch),
};

/** A value of null is None. */
export const highlightEntry: ActionEntry<{
  kind: "highlight";
  value: HighlightColour | null;
}> = {
  readOnly: false,
  run: (view, action) =>
    setNamedMark(view.state, "highlight", action.value, view.dispatch),
};

export const linkEntry: ActionEntry<{ kind: "link"; href: string | null }> = {
  readOnly: false,
  run: (view, action) => setLink(view.state, action.href, view.dispatch),
};

export const clearFormattingEntry: ActionEntry<{ kind: "clear_formatting" }> = {
  readOnly: false,
  run: (view) => clearFormatting(view.state, view.dispatch),
};
