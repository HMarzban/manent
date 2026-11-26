// Everything the script editor is given by the composition root; no CRDT, React or registry type.
import type { Node } from "prosemirror-model";
import type { EditorState, Plugin, Transaction } from "prosemirror-state";
import type {
  Alignment,
  BlockJSON,
  FormatId,
  TitlePageField,
  TitlePageFields,
} from "@manent/schema";

/** An animation frame; it may never fire. Returns its cancel. */
export interface Frames {
  request(fn: () => void): () => void;
}

export interface Timers {
  now: () => number;
  schedule(fn: () => void, delayMs: number): () => void;
}

export interface HistoryPort {
  /** Without `dispatch`: whether it could. */
  undo(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;
  redo(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;
  canUndo(state: EditorState): boolean;
  canRedo(state: EditorState): boolean;
  /** The next change starts a new undo step. */
  closeStep(state: EditorState): void;
  /** Called each time the undo stack gains a step (an undo of a redo included); returns unsubscribe. */
  onStep(listener: () => void): () => void;
}

export interface BlockPlace {
  readonly blockId: string;
  /** In UTF-16 units inside the block. */
  readonly offset: number;
}

export interface CursorPlace {
  readonly anchor: BlockPlace;
  readonly head: BlockPlace;
  /** The head block's index when sent: a hint, never trusted. */
  readonly at: number;
}

export interface RemoteCursor {
  readonly key: string;
  readonly userId: string;
  readonly name: string;
  readonly initials: string;
  /** 1–10: the collaborator token `--collab-<n>`. */
  readonly colour: number;
  readonly place: CursorPlace;
  /** Milliseconds since the epoch. */
  readonly movedAt: number;
}

export interface PresentPerson {
  readonly userId: string;
  readonly name: string;
  readonly colour: number;
}

export interface PresencePort {
  publish(place: CursorPlace | null): void;
  subscribe(listener: (cursors: readonly RemoteCursor[]) => void): () => void;
  /** Everyone else with a stamped entry, cursor or not, one per userId, by name. */
  subscribePeople(
    listener: (people: readonly PresentPerson[]) => void,
  ): () => void;
}

export interface EditorBinding {
  /** The document to start from. */
  readonly doc: Node;
  /** Placed before every other plugin. */
  readonly plugins: readonly Plugin[];
  isRemote(tr: Transaction): boolean;
  /** The transaction an undo or a redo caused. */
  isUndoRedo(tr: Transaction): boolean;
  readonly history: HistoryPort;
  readonly presence: PresencePort;
}

/** Field for field the web app's editor facts. */
export interface FactsShape {
  element: string | null;
  page: string | null;
  pageCount: number | null;
  scene: string | null;
  /** The caret's block, and the scene heading at or before it. */
  blockId: string | null;
  sceneId: string | null;
  /** The caret block's layout as the engine resolves it: indent and width in cells, space before in lines. */
  blockIndent: number | null;
  blockWidth: number | null;
  blockAlign: Alignment | null;
  blockSpaceBefore: number | null;
  /** The caret block's own spaceBefore attribute is not null (Space before shows checked). */
  blockSpaceBeforeSet: boolean | null;
  /** The page's text column, cells; null without pages (Ink). */
  columnCells: number | null;
  /** The caret page's revision name and its place among the pages; null outside production. */
  pageRevision: string | null;
  pageOrdinal: number | null;
  canUndo: boolean;
  canRedo: boolean;
  selectionEmpty: boolean;
  /** The selected text when the selection lies inside one element; "" otherwise. */
  selectedText: string;
  /** How many matches the Find bar's text has, and which of them the selection holds, from 1; null when none. */
  findCount: number;
  findCurrent: number | null;
}

export interface FactsSink {
  publish(changed: Partial<FactsShape>): void;
}

/**
 * A scene (a scene heading, slug or chapter), an act, a section, or an Ink knot or stitch. `synopsis` and `omitted`:
 * the heading's own attributes. `eighths`: a scene's length in eighths of a page; null for any other kind.
 */
export interface OutlineEntry {
  blockId: string;
  kind: "scene" | "act" | "section" | "knot" | "stitch";
  number: string | null;
  heading: string;
  synopsis: string;
  eighths: number | null;
  omitted: boolean;
  current: boolean;
}

export interface OutlineSink {
  publish(rows: readonly OutlineEntry[]): void;
  /** Updates only the active heading's block id, without replacing the rows. */
  publishCurrent?(blockId: string | null): void;
  /** Updates only the viewport-scrolled heading's block id (ghost follow), without replacing the rows. */
  publishViewed?(blockId: string | null): void;
}

export interface DispatchGuardPort {
  enter(): void;
  leave(): void;
}

export interface SettingsReader {
  get(key: string): unknown;
  subscribe(key: string, listener: () => void): () => void;
}

export interface EditorWords {
  /** The element's label in this format and project kind. */
  element(format: FormatId, type: string, kind: string | null): string;
  /** Null: the element shows none (a page break). */
  placeholder(
    format: FormatId,
    type: string,
    kind: string | null,
  ): string | null;
  readonly picker: string;
  readonly offFontNote: string;
}

/** The script's title page, read and written in the shared document; a write is one undo step's worth of typing. */
export interface TitlePagePort {
  get(): TitlePageFields;
  set(field: TitlePageField, value: string): void;
  /** Told after any field changes, by anyone; returns unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** Where the title page is kept, and each field's name: its box's accessible name and its placeholder. */
export interface TitlePageSource {
  readonly port: TitlePagePort;
  readonly words: Readonly<Record<TitlePageField, string>>;
}

/** The clipboard's reader of text from outside Manent. */
export interface PastedTextPort {
  /** Null: paste as plain text. Blocks: the elements the text is converted to in a second undo step. */
  read(
    text: string,
    elements: readonly string[],
    plainElement: string,
  ): readonly BlockJSON[] | null;
  /** After the conversion: how many elements it made. */
  converted(count: number): void;
}

/** The reader of an editor given none: every paste stays plain text. */
export const NO_PASTED_TEXT: PastedTextPort = Object.freeze({
  read: () => null,
  converted: () => {},
});

/** Where a person left a script: restored when it opens again. */
export interface SavedPlace {
  readonly anchor: BlockPlace;
  readonly head: BlockPlace;
  /** The block at the top of the view and how far its top sits above the view's top, px at 100 % zoom. */
  readonly top: { readonly blockId: string; readonly offsetPx: number };
}

// the ProseMirror types the web app holds, which only the editor may import
export type { Plugin } from "prosemirror-state";
export type { EditorView } from "prosemirror-view";
