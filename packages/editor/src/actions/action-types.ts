// What an editor action is given, what it answers, and what one kind of action is.
import type { FormatId, IdSource } from "@manent/schema";
import type { EditorView } from "prosemirror-view";
import type { ElementRef, ElementSlot } from "../elements/slots.ts";
import type { HistoryPort } from "../script-editor/ports.ts";

export const TEXT_COLOURS = [
  "red",
  "orange",
  "green",
  "blue",
  "violet",
] as const;
export type TextColour = (typeof TEXT_COLOURS)[number];
export const HIGHLIGHT_COLOURS = [
  "yellow",
  "green",
  "pink",
  "orange",
  "violet",
] as const;
export type HighlightColour = (typeof HIGHLIGHT_COLOURS)[number];
export const STYLE_MARKS = [
  "bold",
  "italic",
  "underline",
  "strike",
  "caps",
] as const;
export type StyleMark = (typeof STYLE_MARKS)[number];

export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        "needs_two_speeches" | "not_in_format" | "read_only" | "nothing_to_do";
    };

export interface ActionContext {
  format(): FormatId;
  /** The element a picker key gives in `format`; null when the format has none there. */
  slotElement(format: FormatId, slot: ElementSlot): ElementRef | null;
  history: HistoryPort;
  ids: IdSource;
  openPicker(view: EditorView): void;
  /** Puts the caret at `offset` in `blockId` near the view's top and focuses the page. */
  goTo(blockId: string, offset: number): void;
  editable(): boolean;
  /** The profile's text column, in cells; null without pages (Ink), where a layout clamps nothing but space before. */
  columnCells(): number | null;
}

/** One kind of editor action, `A`: what running it does, and whether a page that is not editable still runs it. */
export interface ActionEntry<A extends { kind: string }> {
  readonly readOnly: boolean;
  run(view: EditorView, action: A, context: ActionContext): ActionResult;
}
