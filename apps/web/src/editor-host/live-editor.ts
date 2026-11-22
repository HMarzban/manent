// The open editor of each document, for code outside the mount.
import type { CrdtDoc } from "@manent/crdt";
import { paginationKey } from "@manent/editor";
import type { EditorView, PageScaffold, PresencePort } from "@manent/editor";
import type { FrontPage, Pagination } from "@manent/pagination";

export interface LiveEditor {
  readonly docId: string;
  /** The document the editor shows, for what reads the script's maps (Details → Script → Import, Export). */
  readonly doc: CrdtDoc;
  readonly view: EditorView;
  /** Null: Ink, which has no pages. */
  readonly scaffold: PageScaffold | null;
  readonly presence: PresencePort;
  readonly editable: boolean;
  /** The page's factor, 1 at 100 %. */
  zoom(): number;
  /** The pages before page 1 as print and PDF draw them; null without pages or a title page. */
  frontPages(): FrontPage[] | null;
}

const editors = new Map<string, LiveEditor>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function liveEditor(docId: string): LiveEditor | null {
  return editors.get(docId) ?? null;
}

/** The pages of that document's editor; null for Ink, or when none is open. */
export function livePagination(docId: string): Pagination | null {
  const editor = liveEditor(docId);
  if (editor === null || editor.scaffold === null) return null;
  return paginationKey.getState(editor.view.state)?.pagination ?? null;
}

/** The pages before page 1 of that document's editor, as print and PDF draw them; null when it has none or none is open. */
export function liveFrontPages(docId: string): FrontPage[] | null {
  return liveEditor(docId)?.frontPages() ?? null;
}

/** For the mount only. A second editor of one document replaces the first; the returned function removes this one while it is still registered. */
export function registerLiveEditor(editor: LiveEditor): () => void {
  editors.set(editor.docId, editor);
  notify();
  return () => {
    if (editors.get(editor.docId) !== editor) return;
    editors.delete(editor.docId);
    notify();
  };
}

/** Fires when an editor is registered or leaves: the source `useSyncExternalStore` reads. */
export function subscribeLiveEditors(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
