// What the prompter commands know of the open rundown, or of the story open beside it.
import type { CommandContext } from "@manent/commands";

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const prompterActions: {
  get(docId: string): CommandContext["prompter"];
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  get: () => null,
  subscribe: () => () => {},
});
