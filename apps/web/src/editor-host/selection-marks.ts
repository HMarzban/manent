// Reads the active inline marks of the live editor's selection without importing @manent/editor at runtime.
import { liveEditor } from "./live-editor.ts";

export interface SelectionMarks {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
  readonly caps: boolean;
  readonly color: string | "mixed" | null;
  readonly highlight: string | "mixed" | null;
}

export const EMPTY_SELECTION_MARKS: SelectionMarks = Object.freeze({
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  caps: false,
  color: null,
  highlight: null,
});

interface MarkLike {
  readonly type: { readonly name: string };
  readonly attrs: Readonly<Record<string, unknown>>;
}

const hasMark = (marks: readonly MarkLike[], name: string): boolean =>
  marks.some((mark) => mark.type.name === name);

function markValue(marks: readonly MarkLike[], name: string): string | null {
  const found = marks.find((mark) => mark.type.name === name);
  const raw = found?.attrs.value;
  return typeof raw === "string" && raw !== "" ? raw : null;
}

function mergeValue(
  seen: boolean,
  current: string | "mixed" | null,
  next: string | null,
): string | "mixed" | null {
  if (!seen) return next;
  return current === next ? current : "mixed";
}

/** Reads uniform inline marks across every non-empty text node in `docId`'s current selection. */
export function readSelectionMarks(docId: string): SelectionMarks {
  const editor = liveEditor(docId);
  if (editor === null) return EMPTY_SELECTION_MARKS;
  const { doc, selection } = editor.view.state;
  let seen = false;
  let bold = true;
  let italic = true;
  let underline = true;
  let strike = true;
  let caps = true;
  let color: string | "mixed" | null = null;
  let highlight: string | "mixed" | null = null;

  for (const range of selection.ranges) {
    const from = range.$from.pos;
    const to = range.$to.pos;
    if (from >= to) continue;
    doc.nodesBetween(from, to, (node) => {
      if (!node.isText || node.text === "") return;
      const marks = node.marks;
      if (bold && !hasMark(marks, "bold")) bold = false;
      if (italic && !hasMark(marks, "italic")) italic = false;
      if (underline && !hasMark(marks, "underline")) underline = false;
      if (strike && !hasMark(marks, "strike")) strike = false;
      if (caps && !hasMark(marks, "caps")) caps = false;
      color = mergeValue(seen, color, markValue(marks, "color"));
      highlight = mergeValue(seen, highlight, markValue(marks, "highlight"));
      seen = true;
    });
  }

  return seen
    ? { bold, italic, underline, strike, caps, color, highlight }
    : EMPTY_SELECTION_MARKS;
}
