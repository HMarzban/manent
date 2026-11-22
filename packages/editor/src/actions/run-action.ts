import type { FormatId, IdSource } from "@manent/schema";
import type { EditorView } from "prosemirror-view";
import type { ElementRef, ElementSlot } from "../elements/slots.ts";
import { setElement } from "../keys/element-keys.ts";
import type { HistoryPort } from "../script-editor/ports.ts";
import type { ActionResult, EditorAction } from "./action-types.ts";
import { toggleDualDialogue } from "./dual.ts";
import { setLayout, toggleAlign, toggleSpaceBefore } from "./layout.ts";
import { insertPageBreak } from "./page-break.ts";
import { setNamedMark, toggleStyle } from "./styles.ts";

/** What a page that is not editable still runs: undo and redo, finding, and moving the caret. */
const READ_ONLY_ACTIONS: readonly EditorAction["kind"][] = Object.freeze([
  "undo",
  "redo",
  "find",
  "find_next",
  "find_previous",
  "go_to",
  "step_scene",
  "go_to_person",
]);

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

/**
 * Runs `action` on the view. On a page that is not editable everything but undo, redo, finding and moving the caret is
 * `read_only`. Finding, moving the caret and a synopsis are loaded apart the first time one is asked for, so they
 * answer `ok` at once and run when loaded.
 */
export function runAction(
  view: EditorView,
  action: EditorAction,
  context: ActionContext,
): ActionResult {
  const { state, dispatch } = view;
  if (!context.editable() && !READ_ONLY_ACTIONS.includes(action.kind))
    return { ok: false, reason: "read_only" };
  switch (action.kind) {
    case "element": {
      const element = context.slotElement(context.format(), action.slot);
      if (element === null) return { ok: false, reason: "not_in_format" };
      setElement(element)(state, dispatch);
      return { ok: true };
    }
    case "picker":
      context.openPicker(view);
      return { ok: true };
    case "dual_dialogue":
      return toggleDualDialogue(state, dispatch);
    case "page_break":
      insertPageBreak(context.ids)(state, dispatch);
      return { ok: true };
    case "style":
      return toggleStyle(state, action.mark, dispatch);
    case "colour":
      return setNamedMark(state, "color", action.value, dispatch);
    case "highlight":
      return setNamedMark(state, "highlight", action.value, dispatch);
    case "align":
      return toggleAlign(state, action.value, dispatch);
    case "space_before":
      return toggleSpaceBefore(state, dispatch);
    case "layout":
      return setLayout(state, action, dispatch);
    case "undo":
      return context.history.undo(state, dispatch)
        ? { ok: true }
        : { ok: false, reason: "nothing_to_do" };
    case "redo":
      return context.history.redo(state, dispatch)
        ? { ok: true }
        : { ok: false, reason: "nothing_to_do" };
    case "find":
    case "find_next":
    case "find_previous":
    case "replace":
    case "replace_all":
    case "go_to":
    case "step_scene":
    case "go_to_person":
    case "synopsis":
      void import("./apart-actions.ts").then(({ runApart }) => {
        if (!view.isDestroyed) runApart(view, action, context.goTo);
      });
      return { ok: true };
  }
}
