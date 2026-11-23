// Where the person's typing in each document goes: to everyone as they type, as suggestions, or to a private copy.
import type { Subscribable } from "@manent/ui";

const WRITING_POSITIONS = ["everyone", "suggestions", "private"] as const;
export type WritingPosition = (typeof WRITING_POSITIONS)[number];

const EVERYONE: Subscribable<WritingPosition> = Object.freeze({
  get: (): WritingPosition => "everyone",
  subscribe: () => () => {},
});

/**
 * `writingPositionOf`: where the person's typing in a document goes. `openTarget`: the document the person's editor
 * of a document opens. `get` is what a command's context reads, and `subscribe`'s listener hears every change.
 */
export const writingActions: {
  writingPositionOf(docId: string): Subscribable<WritingPosition>;
  openTarget(docId: string): string;
  get(docId: string): { position: WritingPosition; othersHaveAccess: boolean };
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  writingPositionOf: () => EVERYONE,
  openTarget: (docId: string) => docId,
  get: () => ({ position: WRITING_POSITIONS[0], othersHaveAccess: false }),
  subscribe: () => () => {},
});
