// The open editor of each document, for code outside the mount.
import type { CrdtDoc } from "@manent/crdt";
import { paginationKey } from "@manent/editor";
import type { EditorView, PageScaffold, PresencePort } from "@manent/editor";
import type { Pagination } from "@manent/pagination";

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

/** Focus goes to the page at the caret; the view focuses itself only while it is editable, so a read-only page is focused as a text box. */
export function focusCaret(view: EditorView): void {
  if (view.editable) view.focus();
  else view.dom.focus({ preventScroll: true });
}

/** Focus goes to that document's page at the caret; false when none is open or its page cannot take focus yet. */
export function focusLiveEditor(docId: string): boolean {
  const editor = liveEditor(docId);
  if (editor === null) return false;
  focusCaret(editor.view);
  return editor.view.dom.ownerDocument.activeElement === editor.view.dom;
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
