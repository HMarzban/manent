// The open editor of each document, for code outside the mount: it holds none of the editor's code, so the entry and the
// document's screen name an editor before that code arrives.
import type { CrdtDoc } from "@manent/crdt";
import type {
  EditorView,
  PageFurnitureOptions,
  PageScaffold,
  PresencePort,
} from "@manent/editor";
import { contentPageCount } from "@manent/pagination";
import type { FrontPage, Pagination } from "@manent/pagination";

export type { PageFurnitureOptions };

export interface LiveEditor {
  readonly docId: string;
  /** The document the editor shows, for what reads the script's maps (Details → Script → Import, Export). */
  readonly doc: CrdtDoc;
  readonly view: EditorView;
  /** Null: Ink, which has no pages. */
  readonly scaffold: PageScaffold | null;
  readonly presence: PresencePort;
  readonly editable: boolean;
  setEditable?(editable: boolean): void;
  /** Its pages now; null: Ink. */
  pagination(): Pagination | null;
  /** The page's factor, 1 at 100 %. */
  zoom(): number;
  /** The pages before page 1 as print and PDF draw them; null without pages or a title page. */
  frontPages(): FrontPage[] | null;
  /** The furniture options of the open editor (header, footer, dateFormat, revisionLabel, day, durationMs). */
  furniture?(): PageFurnitureOptions;
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
  return liveEditor(docId)?.pagination() ?? null;
}

/** How many pages that document's editor has without the lettered ones locked page numbers add; null for Ink, or when none is open. */
export function liveContentPageCount(docId: string): number | null {
  const pagination = livePagination(docId);
  return pagination === null
    ? null
    : contentPageCount(pagination.pages.map((page) => page.label));
}

/** The pages before page 1 of that document's editor, as print and PDF draw them; null when it has none or none is open. */
export function liveFrontPages(docId: string): FrontPage[] | null {
  return liveEditor(docId)?.frontPages() ?? null;
}

/** The furniture options of that document's editor, or empty options when none is open. */
export function liveFurniture(docId: string): PageFurnitureOptions {
  return liveEditor(docId)?.furniture?.() ?? {};
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
