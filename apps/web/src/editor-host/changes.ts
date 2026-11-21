// Changes since a version, drawn on the live page by the editor's changes plugin; the document itself is never touched.
import { changesKey, setChanges } from "@manent/editor";
import type { ChangesDisplay } from "@manent/editor";
import type { Comparison } from "@manent/revisions";
import type { VersionContent } from "@manent/sync-protocol";
import { docOfContent } from "../history/content-doc.ts";
import { liveEditor } from "./live-editor.ts";

/** Shows on the live page the changes since `value.baseline`, whose comparison with Working is `value.comparison`; null hides them. Nothing happens while the script has no editor, or for a baseline the schema refuses. */
export function showChanges(
  docId: string,
  value: {
    baseline: VersionContent;
    comparison: Comparison;
    display: ChangesDisplay;
  } | null,
): void {
  const view = liveEditor(docId)?.view;
  if (view === undefined) return;
  const baseline = value === null ? null : docOfContent(value.baseline);
  view.dispatch(
    setChanges(
      view.state.tr,
      value === null || baseline === null
        ? null
        : { baseline, comparison: value.comparison, display: value.display },
    ).setMeta("addToHistory", false),
  );
}

/** The comparison the live page shows, kept current as the script changes; null while none is shown. */
export function shownComparison(docId: string): Comparison | null {
  const view = liveEditor(docId)?.view;
  return view === undefined
    ? null
    : (changesKey.getState(view.state)?.comparison ?? null);
}
