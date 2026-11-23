// Whether the open script can be started from its project's outline.

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const outlineStartActions: {
  get(docId: string): boolean;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  get: () => false,
  subscribe: () => () => {},
});
