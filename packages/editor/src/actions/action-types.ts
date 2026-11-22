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
 * In `layout` a field left out is unchanged, and null returns it to the element's own. `find` sets the text the Find
 * bar looks for; `replace` and `replace_all` write `text` in place of the match the selection holds, or of every match;
 * `synopsis` writes the one-line summary of the scene whose heading is `blockId`. `go_to` puts the caret at `offset` in
 * `blockId`, `step_scene` at the next scene's heading (1) or the previous one's (-1), and `go_to_person` at the cursor
 * of the person present `userId`; each focuses the page.
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
  | { kind: "redo" }
  | { kind: "find"; search: string }
  | { kind: "find_next" }
  | { kind: "find_previous" }
  | { kind: "replace"; text: string }
  | { kind: "replace_all"; text: string }
  | { kind: "synopsis"; blockId: string; text: string }
  | { kind: "go_to"; blockId: string; offset: number }
  | { kind: "step_scene"; direction: 1 | -1 }
  | { kind: "go_to_person"; userId: string };

export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        "needs_two_speeches" | "not_in_format" | "read_only" | "nothing_to_do";
    };
