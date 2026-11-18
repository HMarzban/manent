// The undo scope of one editor binding: the one place a Yjs UndoManager is built.
import type * as Y from "yjs";
import type { CrdtDoc } from "./doc.ts";

/** The script's fragment, and the production map of revised-page overrides. */
export type UndoRoot = "script" | "revisedOverrides";

/** Opaque but for the roots it covers. */
export interface UndoScope {
  readonly roots: readonly UndoRoot[];
}

export function createUndoScope(
  _doc: CrdtDoc,
  _options: { trackedOrigins: readonly unknown[]; roots: readonly UndoRoot[] },
): UndoScope {
  throw new Error("undo scope: not built");
}

/** The scope's manager, for the editor binding only. */
export function undoManagerForBinding(_scope: UndoScope): Y.UndoManager {
  throw new Error("undo scope: not built");
}
