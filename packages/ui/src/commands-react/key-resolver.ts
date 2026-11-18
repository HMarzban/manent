// The page's one matcher for the editor's keys: the same library match the global keys use, with typing kept out of it.
import { matchesKeyboardEvent, parseHotkey } from "@tanstack/react-hotkeys";
import type { Chord } from "@manent/commands";

/** The id of the command a key press runs, or null; structurally the editor's own resolver type. */
export type KeyResolver = (event: KeyboardEvent) => string | null;

/** A press with no Control, Meta or Alt that types one character, whatever its Shift. */
function typesCharacter(event: KeyboardEvent): boolean {
  return (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    [...event.key].length === 1
  );
}

/**
 * Answers the first entry of `table()` whose chord the press matches. A typed character and a press
 * while an input method is composing answer null at once, without reading the table.
 */
export function createKeyResolver(options: {
  table: () => readonly { id: string; chord: Chord }[];
}): KeyResolver {
  return (event) => {
    if (event.isComposing || typesCharacter(event)) return null;
    return (
      options
        .table()
        .find(({ chord }) => matchesKeyboardEvent(event, parseHotkey(chord)))
        ?.id ?? null
    );
  };
}
