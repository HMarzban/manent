// The one constructor of a Yjs document, with garbage collection always on, and its updates.
import * as Y from "yjs";
import { withWholeUpdate } from "./updates.ts";
import type { StateVector, Update } from "./updates.ts";

export type Unsubscribe = () => void;

/** The origin `applyUpdate` gives a transaction when the caller names none. */
export const ORIGIN_REMOTE = "remote";
/** The origin of a review action's writes, tracked so that each is one undo step. */
export const ORIGIN_REVIEW = "review";
/** The origin of the transaction that loads a document. */
export const ORIGIN_LOAD = "load";

export interface DocOptions {
  clientId?: number;
}

/**
 * A replicated document of any kind; the views over its content are separate
 * functions. Only this package's factories make one: a view given any other
 * object throws a TypeError.
 */
export interface CrdtDoc {
  readonly clientId: number;
  destroy(): void;
  /**
   * All or nothing: bytes that are not a whole update throw CrdtUpdateError and
   * change nothing. What a listener throws reaches the caller as it was thrown,
   * after the update is applied.
   */
  applyUpdate(update: Update, origin?: unknown): void;
  /** The whole document as one update. */
  encodeState(): Update;
  encodeStateVector(): StateVector;
  /** What a peer holding `since` is missing. */
  diff(since: StateVector): Update;
  /** Called once per transaction that changed the document. */
  subscribe(listener: (update: Update, origin: unknown) => void): Unsubscribe;
  /** True while an applied update waits for one it depends on. */
  hasPendingStructs(): boolean;
}

class YjsDoc implements CrdtDoc {
  readonly ydoc: Y.Doc;
  // while applyUpdate runs, what its listeners threw, so that it is not taken for bad bytes
  private listenerThrows: unknown[] | null = null;

  constructor(ydoc: Y.Doc) {
    this.ydoc = ydoc;
  }

  get clientId(): number {
    return this.ydoc.clientID;
  }

  destroy(): void {
    this.ydoc.destroy();
  }

  applyUpdate(update: Update, origin: unknown = ORIGIN_REMOTE): void {
    const listenerThrows: unknown[] = [];
    this.listenerThrows = listenerThrows;
    try {
      withWholeUpdate(update, () => Y.applyUpdate(this.ydoc, update, origin));
    } catch (error) {
      if (listenerThrows.length > 0) throw listenerThrows[0];
      throw error;
    } finally {
      this.listenerThrows = null;
    }
  }

  encodeState(): Update {
    return Y.encodeStateAsUpdate(this.ydoc);
  }

  encodeStateVector(): StateVector {
    return Y.encodeStateVector(this.ydoc);
  }

  diff(since: StateVector): Update {
    return Y.encodeStateAsUpdate(this.ydoc, since);
  }

  subscribe(listener: (update: Update, origin: unknown) => void): Unsubscribe {
    // Yjs also passes its document and transaction: a listener never sees them
    const onUpdate = (update: Update, origin: unknown) => {
      try {
        listener(update, origin);
      } catch (thrown) {
        this.listenerThrows?.push(thrown);
        throw thrown;
      }
    };
    this.ydoc.on("update", onUpdate);
    return () => this.ydoc.off("update", onUpdate);
  }

  hasPendingStructs(): boolean {
    // an update that only deletes waits in pendingDs alone
    const { store } = this.ydoc;
    return store.pendingStructs !== null || store.pendingDs !== null;
  }
}

/** An empty document. Garbage collection is on, and no option turns it off. */
export function createDoc(options?: DocOptions): CrdtDoc {
  const ydoc = new Y.Doc({ gc: true });
  if (options?.clientId !== undefined) ydoc.clientID = options.clientId;
  return new YjsDoc(ydoc);
}

/** A document holding `state`, loaded in one transaction whose origin is ORIGIN_LOAD. Throws CrdtUpdateError. */
export function loadDoc(state: Update, options?: DocOptions): CrdtDoc {
  const doc = createDoc(options);
  doc.applyUpdate(state, ORIGIN_LOAD);
  return doc;
}

/** The Yjs document behind `doc`. Throws a TypeError for a CrdtDoc this package did not create. */
export function yDocOf(doc: CrdtDoc): Y.Doc {
  if (!(doc instanceof YjsDoc))
    throw new TypeError("a CrdtDoc must come from this package");
  return doc.ydoc;
}
