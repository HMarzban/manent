// Whether a writing sprint is running.

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const sprintActions: {
  get(): boolean;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  get: () => false,
  subscribe: () => () => {},
});
