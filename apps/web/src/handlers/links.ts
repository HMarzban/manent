// Copy link: puts the address of the open script, or of the selected version, on the clipboard and says so.
import type { CommandHandlers } from "@manent/commands";
import { LIBRARY_WORDS, LINKS_WORDS, versionRef } from "@manent/ui";
import { historyView } from "../history/history-view.ts";
import { nameOf } from "../services/sync/index-entries.ts";
import type { HandlerDeps } from "./index.ts";

export function linksHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "doc.copyLink" | "history.copyLink"> {
  const { messages, library } = deps.services;
  const copy = (path: string, text: string): void => {
    // absent outside a secure context, such as the demo on a private address over http
    if (navigator.clipboard === undefined) return;
    navigator.clipboard.writeText(`${location.origin}${path}`).then(
      () =>
        messages.push({
          id: "link_copied",
          text,
          actions: [],
          lifetime: "brief",
          ownWork: false,
        }),
      () => {
        // the browser refused the clipboard: nothing was copied, so nothing is said
      },
    );
  };
  return {
    "doc.copyLink"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      const title =
        library.documentTitle(docId).get() ?? LIBRARY_WORDS.untitledScript;
      copy(`/s/${docId}`, LINKS_WORDS.copiedScript(title));
    },
    "history.copyLink"() {
      const view = historyView.get();
      const row = view?.selected ?? null;
      if (view === null || row === null) return;
      copy(
        `/s/${view.docId}/v/${row.item.id}`,
        LINKS_WORDS.copiedVersion(versionRef(row.item, nameOf)),
      );
    },
  };
}
