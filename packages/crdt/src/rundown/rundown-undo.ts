// Undo and redo over a rundown's three roots: fields, columns and rows.
import {
  RUNDOWN_COLUMNS_ROOT,
  RUNDOWN_FIELDS_ROOT,
  RUNDOWN_ROWS_ROOT,
} from "@manent/schema";
import * as Y from "yjs";
import { yDocOf } from "../doc.ts";
import type { CrdtDoc } from "../doc.ts";

export interface RundownUndo {
  undo(): void;
  redo(): void;
  stopCapturing(): void;
  destroy(): void;
}

/**
 * An undo manager over a rundown's fields, columns and rows that records only
 * transactions whose origin is in `trackedOrigins` (and not marked
 * `addToHistory: false`). Each transaction is one undo step, so an import or a
 * multi-row delete undoes as one step.
 */
export function createRundownUndo(
  doc: CrdtDoc,
  options: { trackedOrigins: readonly unknown[] },
): RundownUndo {
  const ydoc = yDocOf(doc);
  const roots = [
    ydoc.getMap<unknown>(RUNDOWN_FIELDS_ROOT),
    ydoc.getArray<unknown>(RUNDOWN_COLUMNS_ROOT),
    ydoc.getMap<unknown>(RUNDOWN_ROWS_ROOT),
  ];
  const manager = new Y.UndoManager(roots, {
    trackedOrigins: new Set(options.trackedOrigins),
    captureTimeout: 0,
    captureTransaction: (tr) => tr.meta.get("addToHistory") !== false,
  });
  return {
    undo: () => {
      manager.undo();
    },
    redo: () => {
      manager.redo();
    },
    stopCapturing: () => {
      manager.stopCapturing();
    },
    destroy: () => {
      manager.destroy();
    },
  };
}
