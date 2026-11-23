// Whether the script is being read aloud.

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const readAloudActions: {
  get(): boolean;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  get: () => false,
  subscribe: () => () => {},
});
