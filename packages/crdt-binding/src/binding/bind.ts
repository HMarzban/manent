// Binds a CRDT document to ProseMirror through y-prosemirror, and hands the editor only its own types.
import { scriptBody, yXmlFragmentForBinding } from "@manent/crdt";
import type { CrdtDoc, UndoRoot } from "@manent/crdt";
import type {
  EditorBinding,
  HistoryPort,
  PresencePort,
  Timers,
} from "@manent/editor";
import { parseDoc, schema } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { initProseMirrorDoc, ySyncPlugin } from "y-prosemirror";
import { hasNewerContent } from "./gate.ts";
import { isRemoteTransaction, isUndoRedoTransaction } from "./remote.ts";

/** What the binding needs from whoever holds the document. sync-client's DocHandle satisfies it; so does the web app's local session. */
export interface BoundDocument {
  doc(): CrdtDoc;
  holdRemote(): void;
  releaseRemote(): void;
  sendAwareness(update: Uint8Array): void;
  onAwareness(listener: (update: Uint8Array) => void): () => void;
}

export type BindResult =
  | { ok: true; binding: EditorBinding; destroy(): void }
  | { ok: false; reason: "newer_content"; doc: Node };

const NO_HISTORY: HistoryPort = Object.freeze({
  undo: () => false,
  redo: () => false,
  canUndo: () => false,
  canRedo: () => false,
  closeStep: () => {},
  onStep: () => () => {},
});

const NO_PRESENCE: PresencePort = Object.freeze({
  publish: () => {},
  subscribe: () => () => {},
  subscribePeople: () => () => {},
});

/** y-sync's plugin under its own key, its view writing to the CRDT only when the document changed, never on a selection change. */
function syncOnDocChange(sync: Plugin): Plugin {
  const { view } = sync.spec;
  return new Plugin({
    ...sync.spec,
    view: (editorView) => {
      const inner = view?.(editorView) ?? {};
      return {
        update: (updated, prevState) => {
          if (updated.state.doc !== prevState.doc)
            inner.update?.(updated, prevState);
        },
        destroy: () => inner.destroy?.(),
      };
    },
  });
}

/**
 * Binds the document unless it holds newer content: then it is returned as
 * this build reads it, for showing read-only, and nothing reads it through
 * y-prosemirror, which would delete what this schema cannot hold.
 */
export function bindDocument(options: {
  document: BoundDocument;
  timers: Timers;
  undoRoots: readonly UndoRoot[];
}): BindResult {
  const crdt = options.document.doc();
  if (hasNewerContent(crdt))
    return {
      ok: false,
      reason: "newer_content",
      doc: parseDoc(scriptBody(crdt).materialize()),
    };
  const fragment = yXmlFragmentForBinding(crdt);
  const { doc, mapping } = initProseMirrorDoc(fragment, schema);
  const binding: EditorBinding = {
    doc,
    plugins: [syncOnDocChange(ySyncPlugin(fragment, { mapping }))],
    isRemote: isRemoteTransaction,
    isUndoRedo: isUndoRedoTransaction,
    history: NO_HISTORY,
    presence: NO_PRESENCE,
  };
  return { ok: true, binding, destroy: () => {} };
}
