import { attrsForNewBlock, schema } from "@manent/schema";
import type { IdSource } from "@manent/schema";
import { Selection, TextSelection } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { insertBlocks } from "../sections/insert-blocks.ts";
import type { ActionEntry } from "./action-types.ts";

/**
 * A page break at the caret, as pasted blocks go in: it splits a block in the
 * middle. The caret goes to the start of the block after the break, or, when
 * there is none, into a new empty block of the caret block's element.
 */
export function insertPageBreak(ids: IdSource): Command {
  return (state, dispatch) => {
    if (dispatch === undefined) return true;
    const element = String(state.selection.$from.parent.attrs.type);
    const tr = insertBlocks(
      state.tr,
      [{ type: "block", attrs: { type: "page_break" } }],
      ids,
    );
    const after = tr.selection.$from.after(2);
    const next = Selection.findFrom(tr.doc.resolve(after), 1, true);
    if (next !== null) tr.setSelection(next);
    else {
      tr.insert(
        after,
        schema.nodes.block.create(attrsForNewBlock(element, ids())),
      );
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export const pageBreakEntry: ActionEntry<{ kind: "page_break" }> = {
  readOnly: false,
  run: (view, _, context) => {
    insertPageBreak(context.ids)(view.state, view.dispatch);
    return { ok: true };
  },
};
