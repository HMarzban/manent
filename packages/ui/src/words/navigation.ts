// Finding and moving through a script: the Find bar, the Scenes tab, the palette's places, and Where am I?

import { formatCount, formatPosition } from "./format.ts";

export const FIND_WORDS = {
  find: "Find",
  replace: "Replace",
  replaceWith: "Replace with",
  replaceAll: "Replace all",
  previous: "Previous match",
  next: "Next match",
  close: "Close Find bar",
  clearFind: "Clear search",
  /** The count beside the field: "3 of 17", "0 of 17" while the selection holds no match, never an error state. */
  count: (current: number | null, count: number): string =>
    count === 0 ? "No matches" : formatPosition(current ?? 0, count),
} as const;

const sceneLength = (eighths: number): string => {
  const pages = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (rest === 0) return formatCount(pages);
  return pages === 0 ? `${rest}/8` : `${formatCount(pages)} ${rest}/8`;
};

export const SCENES_WORDS = {
  synopsis: "Synopsis",
  synopsisPlaceholder: "Scene summary…",
  omitted: "Omitted",
  /** A scene's length in pages and eighths of a page: "3/8", "1", "2 1/8". */
  length: sceneLength,
  /** A scene's length with its unit for tooltips: "1 page", "5 5/8 pages". */
  lengthPages: (eighths: number): string =>
    eighths === 8 ? "1 page" : `${sceneLength(eighths)} pages`,
  /** A manuscript chapter's rounded length in pages: "1 p.", "6 pp.". */
  chapterPages: (eighths: number): string => {
    const pages = Math.max(1, Math.round(eighths / 8));
    return pages === 1 ? "1 p." : `${formatCount(pages)} pp.`;
  },
} as const;

export const PLACE_WORDS = {
  /** A scene's row in the palette, Details and History's filter: its number, then its heading. */
  scene: (number: string, heading: string): string =>
    `Sc. ${number} · ${heading}`,
  /** The next cue of a character after the caret, by the name as the script writes it. */
  nextLine: (name: string): string => `${name}'s next line`,
  /** What Where am I? reads: each part of the place in turn. */
  whereAmI: (parts: readonly string[]): string => parts.join(" · "),
} as const;
