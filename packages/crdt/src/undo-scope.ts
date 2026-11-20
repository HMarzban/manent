// The undo scope of one editor binding: the one place a Yjs UndoManager is built.
import * as Y from "yjs";
import { yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import { FRAGMENT_NAME } from "./mapping.ts";

/** The script's fragment, and the production map of revised-page overrides. */
export type UndoRoot = "script" | "revisedOverrides";

/** Opaque but for the roots it covers. */
export interface UndoScope {
  readonly roots: readonly UndoRoot[];
}

const ROOT_TYPES: Readonly<
  Record<UndoRoot, (ydoc: Y.Doc) => Y.XmlFragment | Y.Map<unknown>>
> = Object.freeze({
  script: (ydoc) => ydoc.getXmlFragment(FRAGMENT_NAME),
  revisedOverrides: (ydoc) => ydoc.getMap("revisedOverrides"),
});

/**
 * Undo never deletes a text that still holds characters, so the words someone
 * else typed into a text my step created survive my undo. The same rule as
 * y-prosemirror's own manager, whose protected node the schema does not have.
 */
function keepFilledText(item: Y.Item): boolean {
  return (
    !(item instanceof Y.Item) ||
    !(item.content instanceof Y.ContentType) ||
    !(item.content.type instanceof Y.Text) ||
    item.content.type.length === 0
  );
}

class YjsUndoScope implements UndoScope {
  readonly roots: readonly UndoRoot[];
  readonly manager: Y.UndoManager;

  constructor(roots: readonly UndoRoot[], manager: Y.UndoManager) {
    this.roots = roots;
    this.manager = manager;
  }
}

/**
 * A manager over the roots that records only writes whose origin is one of
 * `trackedOrigins`, and never a transaction marked `addToHistory: false`.
 */
export function createUndoScope(
  doc: CrdtDoc,
  options: { trackedOrigins: readonly unknown[]; roots: readonly UndoRoot[] },
): UndoScope {
  const ydoc = yDocOf(doc);
  const manager = new Y.UndoManager(
    options.roots.map((root) => ROOT_TYPES[root](ydoc)),
    {
      trackedOrigins: new Set(options.trackedOrigins),
      captureTransaction: (tr) => tr.meta.get("addToHistory") !== false,
      deleteFilter: keepFilledText,
    },
  );
  return new YjsUndoScope([...options.roots], manager);
}

/** The scope's manager, for the editor binding only. Throws a TypeError for a scope createUndoScope did not make. */
export function undoManagerForBinding(scope: UndoScope): Y.UndoManager {
  if (!(scope instanceof YjsUndoScope))
    throw new TypeError("an undo scope must come from createUndoScope");
  return scope.manager;
}
