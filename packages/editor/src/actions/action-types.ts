// What a command, the Ruler or the Layout group asks the editor to do, and what it answers.
import type { Alignment } from "@manent/schema";
import type { ElementSlot } from "../elements/index.ts";

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

/**
 * A colour or highlight of null is None. `align` and `space_before` toggle.
 * In `layout` a field left out is unchanged, and null returns it to the element's own.
 */
export type EditorAction =
  | { kind: "element"; slot: ElementSlot }
  | { kind: "picker" }
  | { kind: "dual_dialogue" }
  | { kind: "page_break" }
  | { kind: "style"; mark: StyleMark }
  | { kind: "colour"; value: TextColour | null }
  | { kind: "highlight"; value: HighlightColour | null }
  | { kind: "align"; value: Alignment }
  | { kind: "space_before" }
  | {
      kind: "layout";
      indent?: number | null;
      width?: number | null;
      align?: Alignment | null;
      spaceBefore?: number | null;
    }
  | { kind: "undo" }
  | { kind: "redo" };

export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        "needs_two_speeches" | "not_in_format" | "read_only" | "nothing_to_do";
    };
