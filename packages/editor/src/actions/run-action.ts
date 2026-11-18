import type { FormatId, IdSource } from "@manent/schema";
import type { EditorView } from "prosemirror-view";
import type { ElementSlot } from "../elements/slots.ts";
import type { HistoryPort } from "../script-editor/ports.ts";
import type { ActionResult, EditorAction } from "./action-types.ts";
import { toggleDualDialogue } from "./dual.ts";
import { setElement } from "./element.ts";
import { setLayout, toggleAlign, toggleSpaceBefore } from "./layout.ts";
import { insertPageBreak } from "./page-break.ts";
import { setNamedMark, toggleStyle } from "./styles.ts";

export interface ActionContext {
  format(): FormatId;
  /** The element a picker key gives in `format`; null when the format has none there. */
  slotElement(
    format: FormatId,
    slot: ElementSlot,
  ): { type: string; kind: string | null } | null;
  history: HistoryPort;
  ids: IdSource;
  openPicker(view: EditorView): void;
  editable(): boolean;
  /** The profile's text column, in cells; null without pages (Ink), where a layout clamps nothing but space before. */
  columnCells(): number | null;
}

/** Runs `action` on the view. On a page that is not editable everything but undo and redo is `read_only`. */
export function runAction(
  view: EditorView,
  action: EditorAction,
  context: ActionContext,
): ActionResult {
  const { state, dispatch } = view;
  if (!context.editable() && action.kind !== "undo" && action.kind !== "redo")
    return { ok: false, reason: "read_only" };
  switch (action.kind) {
    case "element": {
      const element = context.slotElement(context.format(), action.slot);
      if (element === null) return { ok: false, reason: "not_in_format" };
      return setElement(state, element, dispatch);
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
      return setLayout(state, action, context.columnCells(), dispatch);
    case "undo":
      return context.history.undo(state, dispatch)
        ? { ok: true }
        : { ok: false, reason: "nothing_to_do" };
    case "redo":
      return context.history.redo(state, dispatch)
        ? { ok: true }
        : { ok: false, reason: "nothing_to_do" };
  }
}
