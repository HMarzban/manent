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
/** The origin of typing in a title page field, tracked so that it joins undo steps as typing on the page does. */
export const ORIGIN_TITLE_PAGE = "title_page";
/** The origin of a writer's-material write or a scene move, tracked so that each is one undo step. */
export const ORIGIN_MATERIAL = "material";

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
   * change nothing. What a listener throws reaches the caller after the update
   * is applied, never as CrdtUpdateError.
   */
  applyUpdate(update: Update, origin?: unknown): void;
  /** The whole document as one update. */
  encodeState(): Update;
  encodeStateVector(): StateVector;
  /** What a peer holding `since` is missing. */
  diff(since: StateVector): Update;
  /**
   * Called once per transaction that changed the document. What the listener
   * throws is held until Yjs has finished every transaction, then thrown to the
   * caller of the write or apply; several throws arrive as one AggregateError.
   */
  subscribe(listener: (update: Update, origin: unknown) => void): Unsubscribe;
  /** True while an applied update waits for one it depends on. */
  hasPendingStructs(): boolean;
}

/** Throws the one error, or all of them as one AggregateError. */
export function throwAll(errors: readonly unknown[]): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "listeners threw");
}

/** During `applyUpdate`, the diff of the applied bytes against the prior state vector, without cascaded deletions. */
const appliedDiffs = new WeakMap<Y.Doc, Update>();

/** Internal to `@manent/crdt`: the un-cascaded diff of the update being applied to `ydoc`, or null. */
export function appliedDiffOf(ydoc: Y.Doc): Update | null {
  return appliedDiffs.get(ydoc) ?? null;
}

class YjsDoc implements CrdtDoc {
  readonly ydoc: Y.Doc;
  // what listeners threw, held because a throw into Yjs leaves the document unable to emit another update
  private readonly listenerThrows: unknown[] = [];
  // while applyUpdate runs, which throws them itself so that they are not taken for bad bytes
  private applying = false;

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
    // an apply made by a listener leaves the throws to the outermost one
    const outer = this.applying;
    const previous = appliedDiffs.get(this.ydoc);
    this.applying = true;
    try {
      withWholeUpdate(update, () => {
        if (origin !== ORIGIN_LOAD && origin !== ORIGIN_REMOTE)
          appliedDiffs.set(
            this.ydoc,
            Y.diffUpdate(update, Y.encodeStateVector(this.ydoc)),
          );
        Y.applyUpdate(this.ydoc, update, origin);
      });
    } catch (error) {
      if (outer) throw error;
      this.listenerThrows.push(error);
    } finally {
      if (previous === undefined) appliedDiffs.delete(this.ydoc);
      else appliedDiffs.set(this.ydoc, previous);
      this.applying = outer;
    }
    if (!outer) throwAll(this.listenerThrows.splice(0));
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
        // added now, so that every other end-of-transactions handler runs first; Yjs has
        // reset its transaction state by then, so the throw cannot stall the document
        if (this.listenerThrows.push(thrown) === 1 && !this.applying)
          this.ydoc.once("afterAllTransactions", () =>
            throwAll(this.listenerThrows.splice(0)),
          );
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
