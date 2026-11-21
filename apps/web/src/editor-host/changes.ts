// Changes since a version, drawn on the live page by the editor's changes plugin; the document itself is never touched.
import { changesKey, setChanges } from "@manent/editor";
import type { ChangesDisplay } from "@manent/editor";
import { ENGINE_VERSION } from "@manent/pagination";
import { SCENE_HEADINGS, compareDocs, compareModeOf } from "@manent/revisions";
import type { Comparison } from "@manent/revisions";
import { SCHEMA_VERSION } from "@manent/schema";
import type { VersionContent } from "@manent/sync-protocol";
import { docOfContent } from "../history/content-doc.ts";
import { liveEditor, livePagination } from "./live-editor.ts";

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

/** `baseline` against Working, in the mode their builds and engines allow; null while the script has no editor, or for a baseline the schema refuses. */
export function workingComparison(
  docId: string,
  baseline: VersionContent,
): Comparison | null {
  const view = liveEditor(docId)?.view;
  const older = docOfContent(baseline);
  if (view === undefined || older === null) return null;
  const { mode } = compareModeOf(baseline, {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: livePagination(docId)?.engineVersion ?? ENGINE_VERSION,
  });
  return compareDocs(older, view.state.doc.toJSON(), { mode });
}

/** The heading of the scene holding the live caret; null before the first scene, or while the script has no editor. */
export function caretSceneId(docId: string): string | null {
  const view = liveEditor(docId)?.view;
  if (view === undefined) return null;
  let heading: string | null = null;
  view.state.doc.nodesBetween(0, view.state.selection.head, (node) => {
    if (!node.isTextblock) return true;
    if (SCENE_HEADINGS.some((type) => type === node.attrs.type))
      heading = node.attrs.id;
    return false;
  });
  return heading;
}

/** Scrolls the live page so that the block `blockId` sits one third of the way down. */
export function scrollToChange(docId: string, blockId: string): void {
  const view = liveEditor(docId)?.view;
  const block = view?.dom.querySelector(`[data-id=${JSON.stringify(blockId)}]`);
  const scroller = block?.closest("[data-region='page']");
  if (block == null || scroller == null) return;
  scroller.scrollTop +=
    block.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    scroller.clientHeight / 3;
}
