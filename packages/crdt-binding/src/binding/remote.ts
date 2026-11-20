// What y-sync's meta says about a transaction it dispatched.
import type { Transaction } from "prosemirror-state";
import { ySyncPluginKey } from "y-prosemirror";

/** y-sync's meta, read as the flags it may carry; an absent flag is false. */
function syncFlag(
  tr: Transaction,
  flag: "isChangeOrigin" | "isUndoRedoOperation",
): boolean {
  const meta: unknown = tr.getMeta(ySyncPluginKey);
  return (
    typeof meta === "object" &&
    meta !== null &&
    Reflect.get(meta, flag) === true
  );
}

/** A change that came from the CRDT rather than this editor: another person's, never an undo or a redo. */
export function isRemoteTransaction(tr: Transaction): boolean {
  return syncFlag(tr, "isChangeOrigin") && !syncFlag(tr, "isUndoRedoOperation");
}

/** The transaction an undo or a redo of this binding caused. */
export function isUndoRedoTransaction(tr: Transaction): boolean {
  return syncFlag(tr, "isUndoRedoOperation");
}
