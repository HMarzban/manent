// Whether the open script can be started from its project's outline, and how many beats that outline holds.

export interface OutlineStartState {
  readonly outlineDocId: string | null;
  readonly beats: number;
  readonly scriptEmpty: boolean;
  readonly canEdit: boolean;
}

const entries = new Map<string, OutlineStartState>();
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

const isSame = (
  a: OutlineStartState | undefined,
  b: OutlineStartState,
): boolean =>
  a !== undefined &&
  a.outlineDocId === b.outlineDocId &&
  a.beats === b.beats &&
  a.scriptEmpty === b.scriptEmpty &&
  a.canEdit === b.canEdit;

const canStart = (entry: OutlineStartState | undefined): boolean =>
  entry !== undefined &&
  entry.canEdit &&
  entry.scriptEmpty &&
  entry.outlineDocId !== null &&
  entry.beats > 0;

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const outlineStartActions: {
  get(docId: string): boolean;
  entryOf(docId: string): OutlineStartState | null;
  set(docId: string, next: OutlineStartState): void;
  clear(docId: string): void;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  get: (docId: string): boolean => canStart(entries.get(docId)),
  entryOf: (docId: string): OutlineStartState | null =>
    entries.get(docId) ?? null,
  set(docId: string, next: OutlineStartState): void {
    if (isSame(entries.get(docId), next)) return;
    entries.set(docId, next);
    notify();
  },
  clear(docId: string): void {
    if (!entries.delete(docId)) return;
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
});
