// Single-transaction rename actions for character cues and scene-heading locations.
import type { EditorView } from "prosemirror-view";
import type {
  ActionContext,
  ActionEntry,
  ActionResult,
} from "./action-types.ts";

export interface RenameCharacterAction {
  readonly kind: "rename_character";
  readonly from: string;
  readonly to: string;
}

export interface RenameLocationAction {
  readonly kind: "rename_location";
  readonly from: string;
  readonly to: string;
}

interface TextSpan {
  readonly from: number;
  readonly to: number;
}

/** Replaces every `span` with `replacement` in one isolated undo step. */
function applySpans(
  view: EditorView,
  spans: readonly TextSpan[],
  replacement: string,
  context: ActionContext,
): ActionResult {
  if (spans.length === 0) return { ok: false, reason: "nothing_to_do" };
  context.history.closeStep(view.state);
  const tr = view.state.tr;
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i]!;
    tr.insertText(replacement, span.from, span.to);
  }
  view.dispatch(tr);
  context.history.closeStep(view.state);
  return { ok: true };
}

/**
 * Renames every matching character cue in one undo step, preserving any trailing extension such as
 * `(V.O.)` or `(CONT'D)` and leaving dialogue, action, parentheticals and scene headings untouched.
 */
export const renameCharacterEntry: ActionEntry<RenameCharacterAction> = {
  readOnly: false,
  run(view, action, context) {
    const fromName = action.from.trim();
    const toName = action.to.trim();
    if (
      fromName === "" ||
      toName === "" ||
      toName.toLowerCase() === fromName.toLowerCase()
    )
      return { ok: false, reason: "nothing_to_do" };

    const target = fromName.toLowerCase();
    const spans: TextSpan[] = [];
    view.state.doc.descendants((node, pos) => {
      if (!node.isTextblock || node.attrs["type"] !== "character") return true;
      const text = node.textContent;
      const paren = text.indexOf("(");
      const head = paren < 0 ? text : text.slice(0, paren);
      const trimmed = head.trim();
      if (trimmed.toLowerCase() !== target) return false;
      const lead = head.length - head.trimStart().length;
      const spanFrom = pos + 1 + lead;
      spans.push({ from: spanFrom, to: spanFrom + trimmed.length });
      return false;
    });

    return applySpans(view, spans, toName, context);
  },
};

/**
 * Renames every matching scene-heading location in one undo step, using the same extraction rule
 * as `collectNames` (after the first space and before the last ` - `) and preserving intro and time.
 */
export const renameLocationEntry: ActionEntry<RenameLocationAction> = {
  readOnly: false,
  run(view, action, context) {
    const fromLoc = action.from.trim();
    const toLoc = action.to.trim();
    if (fromLoc === "" || toLoc === "" || toLoc === fromLoc)
      return { ok: false, reason: "nothing_to_do" };

    const spans: TextSpan[] = [];
    view.state.doc.descendants((node, pos) => {
      if (!node.isTextblock || node.attrs["type"] !== "scene_heading")
        return true;
      const text = node.textContent;
      const space = text.indexOf(" ");
      if (space < 0) return false;
      const rest = text.slice(space + 1);
      const dash = rest.lastIndexOf(" - ");
      const rawLoc = dash < 0 ? rest : rest.slice(0, dash);
      const trimmed = rawLoc.trim();
      if (trimmed !== fromLoc) return false;
      const lead = rawLoc.length - rawLoc.trimStart().length;
      const spanFrom = pos + 1 + space + 1 + lead;
      spans.push({ from: spanFrom, to: spanFrom + trimmed.length });
      return false;
    });

    return applySpans(view, spans, toLoc, context);
  },
};
