// Undo scoped to one person: y-prosemirror's undo plugin over the manager of the binding's undo scope.
import { undoManagerForBinding } from "@manent/crdt";
import type { UndoScope } from "@manent/crdt";
import type { HistoryPort } from "@manent/editor";
import type { Plugin } from "prosemirror-state";
import { yUndoPlugin } from "y-prosemirror";

/**
 * The plugin owns the manager and destroys it with the view. The port runs
 * the manager itself and dispatches nothing: y-sync dispatches the change an
 * undo or a redo makes, marked as one.
 */
export function createHistory(options: { scope: UndoScope }): {
  plugin: Plugin;
  port: HistoryPort;
} {
  const manager = undoManagerForBinding(options.scope);
  const port: HistoryPort = {
    undo: (_state, dispatch) => {
      if (manager.undoStack.length === 0) return false;
      if (dispatch) manager.undo();
      return true;
    },
    redo: (_state, dispatch) => {
      if (manager.redoStack.length === 0) return false;
      if (dispatch) manager.redo();
      return true;
    },
    canUndo: () => manager.undoStack.length > 0,
    canRedo: () => manager.redoStack.length > 0,
    closeStep: () => manager.stopCapturing(),
    onStep: (listener) => {
      const added = ({ type }: { type: "undo" | "redo" }) => {
        if (type === "undo") listener();
      };
      manager.on("stack-item-added", added);
      return () => manager.off("stack-item-added", added);
    },
  };
  return { plugin: yUndoPlugin({ undoManager: manager }), port };
}
