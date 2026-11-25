// What the host gives the annotations plugin: the comments and notes to draw, their words and what to do on a gesture.
import type { TextAnchor } from "@manent/schema";

/** A comment or a note; one on the whole script has no anchor and is not drawn. `open` fills its underline. */
export interface Annotation {
  id: string;
  kind: "comment" | "note";
  anchor: TextAnchor | null;
  open: boolean;
}

export interface AnnotationsOptions {
  /** The same array until the annotations change. */
  annotations(): readonly Annotation[];
  subscribe(listener: () => void): () => void;
  /** The accessible name of a marker that stands for `comments` comments and `notes` notes. */
  label(comments: number, notes: number): string;
  /** A marker was pressed: the first of its annotations, its top left corner in the viewport, and all ids on its block. */
  onActivate(
    id: string,
    at: { left: number; top: number },
    ids: readonly string[],
  ): void;
  /** Annotations whose text an edit removed; each is said once, when its text goes. */
  onRemoved(ids: readonly string[]): void;
  /** `[` typed right after `[`: `onTyped` gets the caret's document position once both are deleted. */
  noteTrigger: { enabled(): boolean; onTyped(at: number): void };
}
