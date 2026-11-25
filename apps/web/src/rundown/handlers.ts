// Registers the rundown's columns menu, undo/redo actions and unified undo-label recorder.
import { rundownActions } from "../state/rundown.store.ts";

export interface RundownUndoEntry {
  readonly message: string | null;
  readonly steps?: number;
  readonly onUndo?: () => void;
  readonly onRedo?: () => void;
}

const undoRecorders = new Map<string, (entry: RundownUndoEntry) => void>();

/** Registers the active rundown session's undo-label recorder for `docId`; returns the cleanup. */
export function registerUndoRecorder(
  docId: string,
  record: (entry: RundownUndoEntry) => void,
): () => void {
  undoRecorders.set(docId, record);
  return () => {
    if (undoRecorders.get(docId) === record) undoRecorders.delete(docId);
  };
}

/** Pushes an undo entry onto the active rundown session for `docId`, when mounted. */
export function recordRundownUndo(
  docId: string,
  entry: RundownUndoEntry,
): void {
  undoRecorders.get(docId)?.(entry);
}

/** Fills the `columns` slot of `rundown.store.ts` while the rundown screen is mounted; returns the cleanup. */
export function registerColumnsAction(open: () => void): () => void {
  const actions = Object.freeze({ columns: open });
  rundownActions.provide("columns", actions);
  return () => {
    if (rundownActions.slot("columns") === actions)
      rundownActions.provide("columns", Object.freeze({}));
  };
}

const libraryNewHandlers = new Map<string, () => void>();
let activeLibraryProject: string | null = null;

const dispatchLibraryNew = (): void => {
  const active =
    activeLibraryProject === null
      ? undefined
      : libraryNewHandlers.get(activeLibraryProject);
  (active ?? [...libraryNewHandlers.values()].at(-1))?.();
};

const syncLibrarySlot = (): void =>
  rundownActions.provide(
    "library",
    libraryNewHandlers.size === 0
      ? Object.freeze({})
      : Object.freeze({ new: dispatchLibraryNew }),
  );

/** Marks `projectId` as the active Show/News project for the Library's `rundown.new` command. */
export function setActiveLibraryProject(projectId: string): void {
  activeLibraryProject = projectId;
}

/** Registers `onNew` for `projectId` in the `library` rundown slot; returns the cleanup. */
export function registerLibraryNew(
  projectId: string,
  onNew: () => void,
): () => void {
  libraryNewHandlers.set(projectId, onNew);
  activeLibraryProject ??= projectId;
  syncLibrarySlot();
  return () => {
    libraryNewHandlers.delete(projectId);
    if (activeLibraryProject === projectId)
      activeLibraryProject = [...libraryNewHandlers.keys()].at(-1) ?? null;
    syncLibrarySlot();
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
