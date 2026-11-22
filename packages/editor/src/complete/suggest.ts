// What to offer at the caret: names from the script, and the usual intros, times, transitions and extensions.
import type { Names } from "./names.ts";

export const SEED_TIMES = ["DAY", "NIGHT", "CONTINUOUS", "LATER"] as const;
export const SEED_TRANSITIONS = [
  "CUT TO:",
  "DISSOLVE TO:",
  "FADE OUT.",
] as const;
export const SEED_EXTENSIONS = ["(V.O.)", "(O.S.)", "(CONT'D)"] as const;
export const MAX_SUGGESTIONS = 6;

// the elements' scene intros, written out here until this module can import them
const SCENE_INTROS = ["INT.", "EXT.", "EST.", "I/E."] as const;

/** `from` and `to` are offsets in the block; `next: "times"` goes on to the time of day once accepted. */
export interface Suggestions {
  readonly from: number;
  readonly to: number;
  readonly items: readonly string[];
  readonly next: "close" | "times";
}

const LETTER = /\p{L}/u;

/** The known texts first, most used first and then in order of first use, then the seeds; each once. */
function ranked(
  known: ReadonlyMap<string, number>,
  seeds: readonly string[],
): string[] {
  const used = [...known].toSorted((a, b) => b[1] - a[1]).map(([text]) => text);
  return [...new Set([...used, ...seeds])];
}

function offer(
  candidates: readonly string[],
  typed: string,
  from: number,
  to: number,
  next: Suggestions["next"] = "close",
): Suggestions | null {
  const prefix = typed.toUpperCase();
  // the text already typed in full is never offered, so Enter goes on to the next element
  const items = candidates
    .filter((item) => {
      const upper = item.toUpperCase();
      return upper !== prefix && upper.startsWith(prefix);
    })
    .slice(0, MAX_SUGGESTIONS);
  return items.length === 0 ? null : { from, to, items, next };
}

function cue(
  text: string,
  names: Names,
  recent: readonly string[],
): Suggestions | null {
  const open = text.indexOf("(");
  if (open >= 0)
    return open === text.length - 1 && text.slice(0, open).trim() !== ""
      ? offer(SEED_EXTENSIONS, "", open, text.length)
      : null;
  if (!LETTER.test(text)) return null;
  const known = [...names.characters]
    .toSorted((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([name]) => name);
  return offer([...new Set([...recent, ...known])], text, 0, text.length);
}

function heading(text: string, names: Names): Suggestions | null {
  const space = text.indexOf(" ");
  if (space < 0) return offer(SCENE_INTROS, text, 0, text.length);
  const dash = text.lastIndexOf(" - ");
  if (dash < space)
    return offer(
      ranked(names.locations, []),
      text.slice(space + 1),
      space + 1,
      text.length,
      "times",
    );
  return offer(
    ranked(names.times, SEED_TIMES),
    text.slice(dash + 3),
    dash + 3,
    text.length,
  );
}

/** What to offer for the caret at `offset` in a block of `type` holding `text`; null: nothing. `recent`: cues spoken in this scene, latest first. */
export function suggest(
  type: string,
  text: string,
  offset: number,
  names: Names,
  recent: readonly string[],
): Suggestions | null {
  if (offset !== text.length) return null;
  switch (type) {
    case "character":
      return cue(text, names, recent);
    case "scene_heading":
      return heading(text, names);
    case "transition":
      return offer(
        ranked(names.transitions, SEED_TRANSITIONS),
        text,
        0,
        offset,
      );
    case "slug":
      return offer(ranked(names.slugs, []), text, 0, offset);
    default:
      return null;
  }
}
