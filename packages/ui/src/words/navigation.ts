// Finding and moving through a script: the Find bar, the Scenes tab, the palette's places, and Where am I?

import { formatCount } from "./format.ts";

export const FIND_WORDS = {
  find: "Find",
  replace: "Replace",
  replaceWith: "Replace with",
  replaceAll: "Replace all",
  previous: "Previous match",
  next: "Next match",
  close: "Close Find bar",
  /** The count beside the field: "3 of 17" while the selection holds a match, never an error state. */
  count: (current: number | null, count: number): string => {
    if (count === 0) return "No matches";
    if (current === null)
      return count === 1 ? "1 match" : `${formatCount(count)} matches`;
    return `${formatCount(current)} of ${formatCount(count)}`;
  },
} as const;

export const SCENES_WORDS = {
  filter: "Filter",
  synopsis: "Synopsis",
  /** A scene's length in pages and eighths of a page: "3/8", "1", "2 1/8". */
  length: (eighths: number): string => {
    const pages = Math.floor(eighths / 8);
    const rest = eighths % 8;
    if (rest === 0) return formatCount(pages);
    return pages === 0 ? `${rest}/8` : `${formatCount(pages)} ${rest}/8`;
  },
} as const;

export const PLACE_WORDS = {
  /** A scene in the palette: its number, then its heading. */
  scene: (number: string, heading: string): string =>
    `Scene ${number} · ${heading}`,
  /** The next cue of a character after the caret, by the name as the script writes it. */
  nextLine: (name: string): string => `${name}'s next line`,
  /** What Where am I? reads: each part of the place in turn. */
  whereAmI: (parts: readonly string[]): string => parts.join(" · "),
} as const;
