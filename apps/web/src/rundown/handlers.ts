// Registers the rundown's columns menu and undo/redo actions into the shared rundown command store.
import { rundownActions } from "../state/rundown.store.ts";

/** Fills the `columns` slot of `rundown.store.ts` while the rundown screen is mounted; returns the cleanup. */
export function registerColumnsAction(open: () => void): () => void {
  const actions = Object.freeze({ columns: open });
  rundownActions.provide("columns", actions);
  return () => {
    if (rundownActions.slot("columns") === actions)
      rundownActions.provide("columns", Object.freeze({}));
  };
}

/**
 * Registers rundown `undo` and `redo` into the `rows` slot without displacing other row actions provided by sibling
 * modules; restores the previous slot contents on cleanup.
 */
export function registerRundownUndo(handlers: {
  undo(): void;
  redo(): void;
}): () => void {
  const prior = rundownActions.slot("rows") ?? {};
  const merged = Object.freeze({
    ...prior,
    undo: handlers.undo,
    redo: handlers.redo,
  });
  rundownActions.provide("rows", merged);
  return () => {
    const current = rundownActions.slot("rows");
    if (current !== merged) return;
    const { undo: _u, redo: _r, ...rest } = prior;
    rundownActions.provide("rows", Object.freeze(rest));
  };
}
