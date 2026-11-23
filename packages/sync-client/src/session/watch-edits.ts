// The own edits made in a document while nothing else watches it, as while its store is read.
import { ORIGIN_LOAD, ORIGIN_REMOTE, observeScript } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { elementsOf } from "./edits.ts";
import type { UnsavedEdit } from "./edits.ts";

/** The own edits made in `doc` from now until the returned function is called, which stops watching and gives them. */
export function watchEdits(doc: CrdtDoc | null): () => UnsavedEdit[] {
  const made: UnsavedEdit[] = [];
  const unobserve =
    doc === null
      ? () => {}
      : observeScript(doc, (report) => {
          if (report.origin === ORIGIN_LOAD || report.origin === ORIGIN_REMOTE)
            return;
          made.push({ update: report.update, elements: elementsOf(report) });
        });
  return () => {
    unobserve();
    return made;
  };
}
