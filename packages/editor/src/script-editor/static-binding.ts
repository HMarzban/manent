import type { Node } from "prosemirror-model";
import type { EditorBinding } from "./ports.ts";

const never = (): boolean => false;
const nothing = (): void => {};
const unsubscribed = (): (() => void) => nothing;

/** A read-only page of `doc`: no plugins, nothing remote, no undo history and no presence. */
export function staticBinding(doc: Node): EditorBinding {
  return {
    doc,
    plugins: [],
    isRemote: never,
    isUndoRedo: never,
    history: {
      undo: never,
      redo: never,
      canUndo: never,
      canRedo: never,
      closeStep: nothing,
      onStep: unsubscribed,
    },
    presence: {
      publish: nothing,
      subscribe: unsubscribed,
      subscribePeople: unsubscribed,
    },
  };
}
