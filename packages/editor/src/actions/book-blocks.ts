// Book structural insertions: scene breaks and new chapters inserted as single undoable transactions.
import { attrsForNewBlock, schema } from "@manent/schema";
import type { IdSource } from "@manent/schema";
import { Selection, TextSelection } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { insertBlocks } from "../sections/insert-blocks.ts";
import type { ActionEntry } from "./action-types.ts";

const DEFAULT_BREAK_TEXT = "* * *";

/** Inserts a centred manuscript scene break at the caret and places the caret in a body block after it. */
export function insertSceneBreak(ids: IdSource): Command {
  return (state, dispatch) => {
    if (dispatch === undefined) return true;
    const tr = insertBlocks(
      state.tr,
      [
        {
          type: "block",
          attrs: { type: "break" },
          content: [{ type: "text", text: DEFAULT_BREAK_TEXT }],
        },
      ],
      ids,
    );
    const after = tr.selection.$from.after(2);
    const next = Selection.findFrom(tr.doc.resolve(after), 1, true);
    if (next !== null) tr.setSelection(next);
    else {
      tr.insert(
        after,
        schema.nodes.block.create(attrsForNewBlock("body", ids())),
      );
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/**
 * Inserts a new `chapter` block (at the end of the document when `atEnd` is true, else at the caret), followed by an
 * empty `body` block when inserted at the end, and focuses the new chapter heading.
 */
export function insertChapter(
  ids: IdSource,
  options?: { readonly title?: string; readonly atEnd?: boolean },
): Command {
  return (state, dispatch) => {
    if (dispatch === undefined) return true;
    const title = options?.title?.trim() ?? "";
    const chapterBlock = schema.nodes.block.create(
      attrsForNewBlock("chapter", ids()),
      title === "" ? null : schema.text(title),
    );
    if (options?.atEnd === true) {
      const endOfLastSection = state.doc.content.size - 1;
      const bodyBlock = schema.nodes.block.create(
        attrsForNewBlock("body", ids()),
      );
      const tr = state.tr.insert(endOfLastSection, [chapterBlock, bodyBlock]);
      const caretPos =
        title === ""
          ? endOfLastSection + 1
          : endOfLastSection + 1 + title.length;
      tr.setSelection(TextSelection.create(tr.doc, caretPos));
      dispatch(tr.scrollIntoView());
      return true;
    }
    const tr = insertBlocks(
      state.tr,
      [
        {
          type: "block",
          attrs: { type: "chapter" },
          ...(title === "" ? {} : { content: [{ type: "text", text: title }] }),
        },
      ],
      ids,
    );
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export const insertBreakEntry: ActionEntry<{ kind: "insert_break" }> = {
  readOnly: false,
  run: (view, _, context) => {
    insertSceneBreak(context.ids)(view.state, view.dispatch);
    return { ok: true };
  },
};

export const insertChapterEntry: ActionEntry<{
  kind: "insert_chapter";
  title?: string;
  atEnd?: boolean;
}> = {
  readOnly: false,
  run: (view, action, context) => {
    insertChapter(context.ids, {
      title: action.title,
      atEnd: action.atEnd,
    })(view.state, view.dispatch);
    return { ok: true };
  },
};
