// The project's names, offered for a cue and for the place in a scene heading, beside the script's own.
import { MAX_SUGGESTIONS } from "./suggest.ts";
import type { CompletionSource, Suggestions } from "./suggest.ts";

const LETTER = /\p{L}/u;

/** The project's names that start with `typed` and are not it, ignoring case; null when none does. */
function offer(
  names: readonly string[],
  typed: string,
  from: number,
  next: Suggestions["next"],
): Suggestions | null {
  const prefix = typed.toUpperCase();
  const items = names
    .filter((name) => {
      const upper = name.toUpperCase();
      return upper !== prefix && upper.startsWith(prefix);
    })
    .slice(0, MAX_SUGGESTIONS);
  return items.length === 0
    ? null
    : { from, to: from + typed.length, items, next };
}

/**
 * The project's names for a cue before its extension, and for a scene heading's place (between its intro and any
 * ` - `), over the same text and with the same next step as the script's names, so the two offers are listed as one.
 */
export const projectNamesSource: CompletionSource = (input) => {
  const { element, text, offset, projectNames } = input;
  if (offset !== text.length || projectNames.length === 0) return null;
  if (element === "character")
    return text.includes("(") || !LETTER.test(text)
      ? null
      : offer(projectNames, text, 0, "close");
  if (element !== "scene_heading") return null;
  const space = text.indexOf(" ");
  if (space < 0 || text.lastIndexOf(" - ") >= space) return null;
  return offer(projectNames, text.slice(space + 1), space + 1, "times");
};
