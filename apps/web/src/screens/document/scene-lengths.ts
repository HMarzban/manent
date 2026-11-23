// What a Scenes row shows in place of its length in eighths; a feature adds its source with one line.
import type { Subscribable } from "@manent/ui";

/** Each maps a scene heading's block id to the text its row shows; the first source that holds the id is drawn. */
export const SCENE_LENGTH_SOURCES: readonly ((
  docId: string,
) => Subscribable<ReadonlyMap<string, string>>)[] = [];
