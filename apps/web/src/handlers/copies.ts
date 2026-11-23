// Duplicate, from Title ▾, File and the palette (the script as it is now) and from a version's row (that version); and
// opening the last copy beside the page.
import type { CommandHandlers } from "@manent/commands";
import { openBeside } from "../beside/open-beside.ts";
import type { CopySource } from "../copies/copy-document.ts";
import { lastCopy } from "../copies/last-copy.ts";
import { copyRefusedMessage } from "../copies/messages.ts";
import { historyView } from "../history/history-view.ts";
import type { HandlerDeps } from "./index.ts";

/** Copies `source`, loaded apart from the first load, and opens the copy; a copy the Library refused is said. */
function duplicateAndOpen(deps: HandlerDeps, source: CopySource): void {
  const { services } = deps;
  void import("../copies/duplicate.ts")
    .then(({ duplicate }) => duplicate(services, source))
    .then((made) => {
      if (made.ok) deps.router.navigate(`/s/${made.docId}`);
      else if (made.reason === "not_saved")
        services.messages.push(copyRefusedMessage(made.title));
    });
}

export function copiesHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  "doc.duplicate" | "doc.duplicateVersion" | "copy.openCopyBeside"
> {
  return {
    "doc.duplicate"() {
      const { docId } = deps.shellState();
      if (docId !== null) duplicateAndOpen(deps, { docId, versionId: null });
    },
    // the row selects its version before the command runs
    "doc.duplicateVersion"() {
      const view = historyView.get();
      if (view === null || view.selected === null) return;
      duplicateAndOpen(deps, {
        docId: view.docId,
        versionId: view.selected.item.id,
      });
    },
    "copy.openCopyBeside"() {
      const docId = lastCopy.get();
      if (docId !== null) openBeside(docId, "script", null);
    },
  };
}
