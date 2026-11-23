// Whether the open document is in Trash, and whether the person may delete it.

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const trashActions: {
  get(docId: string): { inTrash: boolean; canDelete: boolean };
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  get: () => ({ inTrash: false, canDelete: false }),
  subscribe: () => () => {},
});
