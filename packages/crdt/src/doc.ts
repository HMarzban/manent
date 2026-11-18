// The one constructor of a Yjs document, with garbage collection always on.
import * as Y from "yjs";

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
}

class YjsDoc implements CrdtDoc {
  readonly ydoc: Y.Doc;

  constructor(ydoc: Y.Doc) {
    this.ydoc = ydoc;
  }

  get clientId(): number {
    return this.ydoc.clientID;
  }

  destroy(): void {
    this.ydoc.destroy();
  }
}

/** An empty document. Garbage collection is on, and no option turns it off. */
export function createDoc(options?: DocOptions): CrdtDoc {
  const ydoc = new Y.Doc({ gc: true });
  if (options?.clientId !== undefined) ydoc.clientID = options.clientId;
  return new YjsDoc(ydoc);
}

/** The Yjs document behind `doc`. Throws a TypeError for a CrdtDoc this package did not create. */
export function yDocOf(doc: CrdtDoc): Y.Doc {
  if (!(doc instanceof YjsDoc))
    throw new TypeError("a CrdtDoc must come from this package");
  return doc.ydoc;
}
