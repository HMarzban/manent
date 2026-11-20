// What the open page does for each of its commands, apart from the entry: only the editor's mount reads it.
import type { EDITOR_COMMANDS } from "@manent/commands";
import type { EditorAction } from "@manent/editor";

/** The commands the open page runs: the editor-scope ones. */
export type PageCommandId = Extract<
  (typeof EDITOR_COMMANDS)[number],
  { scope: "editor" }
>["id"];

/** Undo and Redo chosen outside the page, which the open page runs while it is shown. */
export type HistoryCommandId = "edit.undo" | "edit.redo";

export const EDITOR_COMMAND_ACTIONS: Readonly<
  Record<PageCommandId, EditorAction>
> = Object.freeze({
  "format.element": { kind: "picker" },
  "element.sceneHeading": { kind: "element", slot: "1" },
  "element.action": { kind: "element", slot: "2" },
  "element.character": { kind: "element", slot: "3" },
  "element.parenthetical": { kind: "element", slot: "4" },
  "element.dialogue": { kind: "element", slot: "5" },
  "element.transition": { kind: "element", slot: "6" },
  "element.shot": { kind: "element", slot: "7" },
  "element.section": { kind: "element", slot: "8" },
  "element.newAct": { kind: "element", slot: "9" },
  "element.general": { kind: "element", slot: "0" },
  "element.endOfAct": { kind: "element", slot: "E" },
  "element.emote": { kind: "element", slot: "M" },
  "element.camera": { kind: "element", slot: "C" },
  "element.engineDirection": { kind: "element", slot: "G" },
  "format.dualDialogue": { kind: "dual_dialogue" },
  "format.pageBreak": { kind: "page_break" },
  "format.bold": { kind: "style", mark: "bold" },
  "format.italic": { kind: "style", mark: "italic" },
  "format.underline": { kind: "style", mark: "underline" },
  "format.strike": { kind: "style", mark: "strike" },
  "format.caps": { kind: "style", mark: "caps" },
  "format.alignLeft": { kind: "align", value: "left" },
  "format.alignCenter": { kind: "align", value: "center" },
  "format.alignRight": { kind: "align", value: "right" },
  "format.spaceBefore": { kind: "space_before" },
  "format.colour.none": { kind: "colour", value: null },
  "format.colour.red": { kind: "colour", value: "red" },
  "format.colour.orange": { kind: "colour", value: "orange" },
  "format.colour.green": { kind: "colour", value: "green" },
  "format.colour.blue": { kind: "colour", value: "blue" },
  "format.colour.violet": { kind: "colour", value: "violet" },
  "format.highlight.none": { kind: "highlight", value: null },
  "format.highlight.yellow": { kind: "highlight", value: "yellow" },
  "format.highlight.green": { kind: "highlight", value: "green" },
  "format.highlight.pink": { kind: "highlight", value: "pink" },
  "format.highlight.orange": { kind: "highlight", value: "orange" },
  "format.highlight.violet": { kind: "highlight", value: "violet" },
});

/** The action the open page runs for `id`. */
export function actionOf(id: PageCommandId | HistoryCommandId): EditorAction {
  if (id === "edit.undo") return { kind: "undo" };
  if (id === "edit.redo") return { kind: "redo" };
  return EDITOR_COMMAND_ACTIONS[id];
}
