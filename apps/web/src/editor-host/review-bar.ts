// The margin bar beside each passage of the open script that is to review.
import { marginMarksPlugin } from "@manent/editor";
import type { Plugin } from "@manent/editor";
import { REVIEW_WORDS } from "@manent/ui";
import type { ReviewEntry } from "../services/sync/review.ts";
import type { EditorPluginContext } from "./plugins.ts";

/** The block each open entry stands beside; recovered text with no block of its own stands beside the one it was near. */
const blocksOf = (entries: readonly ReviewEntry[]): readonly string[] =>
  entries.flatMap((e) => {
    const id =
      e.kind === "recovered" ? (e.blockId ?? e.nearBlockId) : e.blockId;
    return id === null ? [] : [id];
  });

/** A bar beside each passage of `context.docId` that is to review; its action opens To review at that passage. */
export function reviewBarPlugin(context: EditorPluginContext): Plugin {
  const { docId, services } = context;
  const entries = services.review.entries(docId);
  // the same list until the entries change, so the bars are placed again only then
  let ids = blocksOf(entries.get());
  return marginMarksPlugin({
    blockIds: () => ids,
    subscribe: (listener) =>
      entries.subscribe(() => {
        ids = blocksOf(entries.get());
        listener();
      }),
    label: REVIEW_WORDS.marginBar,
    onActivate(blockId) {
      services.review.focus(docId, blockId);
      services.commands.run("history.review", "control");
    },
  });
}
