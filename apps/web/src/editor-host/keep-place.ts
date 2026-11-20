// The caret and the top line of the open script, kept through the person's place store: loaded with the editor, apart
// from the entry.
import type { SavedPlace } from "@manent/editor";
import { whenPageLeaves } from "./place.ts";
import type { PlaceStore } from "./place.ts";

/** What the mount keeps the place of: its open editor, whichever build that is. */
interface Placed {
  place(): SavedPlace | null;
  restore(place: SavedPlace): void;
}

/**
 * Puts `editor()` at the place `store` holds for `docId`, then saves its place each time the page is hidden or left,
 * never on a keystroke. `save` saves it now and returns it (null when the editor has none); `stop` saves it and stops.
 */
export function keepPlace(
  store: PlaceStore,
  docId: string,
  editor: () => Placed,
): { save(): SavedPlace | null; stop(): void } {
  const saved = store.place(docId);
  if (saved !== null) editor().restore(saved);
  const save = (): SavedPlace | null => {
    const place = editor().place();
    if (place !== null) store.savePlace(docId, place);
    return place;
  };
  const stopListening = whenPageLeaves(save);
  return {
    save,
    stop() {
      save();
      stopListening();
    },
  };
}
