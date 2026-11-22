// What an open document gives the editor, and the sessions of documents that live in this tab only.
import { ORIGIN_REMOTE, scriptDocFromJSON } from "@manent/crdt";
import type { BoundDocument } from "@manent/crdt-binding";
import { firstElement } from "@manent/editor";
import type { DocJSON, FormatId, IdSource } from "@manent/schema";
import { createCoalescer } from "@manent/sync-client";
import type { Clock, Frames } from "@manent/sync-client";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

export interface EditorSession extends BoundDocument {
  readonly docId: string;
  /** The document was replaced: the editor binds again to `doc()`. */
  onReplaced(listener: () => void): () => void;
  /** Not null: this content is shown read-only instead of being bound (a view-only subscription). */
  readonly readOnly: Subscribable<DocJSON | null>;
  /**
   * True once `doc()` is the device's document holding a block, a read-only view's copy, or, when the device cannot
   * open the document, what it shows: what may be bound.
   */
  readonly kept: Subscribable<boolean>;
  close(): void;
}

export interface EditorSessions {
  /** The same session for the same document while it is open. */
  open(docId: string, format: FormatId): EditorSession;
}

/** A session whose updates and awareness come from inside this tab. */
export interface LocalSession extends EditorSession {
  receive(update: Uint8Array): void;
  receiveAwareness(update: Uint8Array): void;
}

const NEVER_READ_ONLY: Subscribable<DocJSON | null> = createValue(null);
// a document of this tab is the one it keeps
const ALWAYS_KEPT: Subscribable<boolean> = createValue(true);
const noop = (): void => {};

/** One section holding one empty block of the format's first element. */
function newScript(format: FormatId, ids: IdSource): DocJSON {
  const { type, kind } = firstElement(format);
  const block = { type: "block", attrs: { id: ids(), type, kind } } as const;
  return { type: "doc", content: [{ type: "section", content: [block] }] };
}

/**
 * Each new session holds a new script of its format, with a fresh client id; closing it drops the document. A received
 * update is applied with the next frame, merged with the others, and never while held.
 */
export function createLocalSessions(options: {
  frames: Frames;
  clock: Clock;
  ids: IdSource;
}): { open(docId: string, format: FormatId): LocalSession } {
  const open = new Map<string, LocalSession>();
  const create = (docId: string, format: FormatId): LocalSession => {
    const doc = scriptDocFromJSON(newScript(format, options.ids));
    const coalescer = createCoalescer({
      // a local session has no store, so no sequence
      apply: (merged) => doc.applyUpdate(merged, ORIGIN_REMOTE),
      frames: options.frames,
      clock: options.clock,
    });
    const awareness = new Set<(update: Uint8Array) => void>();
    return {
      docId,
      doc: () => doc,
      holdRemote: () => coalescer.hold(),
      releaseRemote: () => coalescer.release(),
      // nobody else in this tab reads this person's caret
      sendAwareness: noop,
      onAwareness(listener) {
        awareness.add(listener);
        return () => {
          awareness.delete(listener);
        };
      },
      onReplaced: () => noop,
      readOnly: NEVER_READ_ONLY,
      kept: ALWAYS_KEPT,
      receive: (update) => coalescer.push(update, 0),
      receiveAwareness(update) {
        for (const listener of awareness) listener(update);
      },
      close() {
        coalescer.dispose();
        awareness.clear();
        doc.destroy();
        open.delete(docId);
      },
    };
  };
  return {
    open(docId, format) {
      const existing = open.get(docId);
      if (existing !== undefined) return existing;
      const created = create(docId, format);
      open.set(docId, created);
      return created;
    },
  };
}
