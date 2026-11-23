// Whether focus mode is on.

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const focusModeActions: {
  get(): boolean;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  get: () => false,
  subscribe: () => () => {},
});
