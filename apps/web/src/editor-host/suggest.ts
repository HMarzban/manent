// Suggesting in the open script, over the person, the clock, new ids, the lock and their Writing position.
import {
  isRemoteTransaction,
  isUndoRedoTransaction,
} from "@manent/crdt-binding";
import { suggestPlugin as editorSuggestPlugin } from "@manent/editor";
import type { Plugin } from "@manent/editor";
import { randomBlockId } from "@manent/schema";
import { REVIEW_WORDS } from "@manent/ui";
import { productionContextActions } from "../state/production-context.store.ts";
import type { EditorPluginContext } from "./plugins.ts";

/** The suggesting plugin of `context.docId`; a suggestion's bar opens its entry in To review. */
export function suggestPlugin(context: EditorPluginContext): Plugin {
  const { docId, services } = context;
  const position = services.writing.writingPositionOf(docId);
  return editorSuggestPlugin({
    userId: services.userId,
    now: Date.now,
    ids: randomBlockId,
    isSuggesting: () => position.get() === "suggestions",
    isLocked: () => productionContextActions.get(docId)?.locked === true,
    isFromBinding: (tr) => isRemoteTransaction(tr) || isUndoRedoTransaction(tr),
    bar: {
      label: REVIEW_WORDS.marginBar,
      onActivate(blockId) {
        services.review.focus(docId, blockId);
        services.commands.run("history.review", "control");
      },
    },
  });
}
