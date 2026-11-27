// The words of writers' material: alternates under a speech, cuts in the left panel, and what is said and printed.
import { formatCount } from "./format.ts";

const EXCERPT_LIMIT = 40;

const elements = (count: number): string =>
  count === 1 ? "1 element" : `${formatCount(count)} elements`;

function excerptOf(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= EXCERPT_LIMIT) return trimmed;
  return `${trimmed.slice(0, EXCERPT_LIMIT).trimEnd()}…`;
}

export const MATERIAL_WORDS = Object.freeze({
  /** The popover's accessible name. */
  alternates: "Alternates",
  useThis: "Use this",
  /** The tag of an alternate pitched from the room. */
  pitched: "Pitched",
  /** The field under the list: its placeholder, then its accessible name. */
  anotherWay: "Type another way to say this line. Enter swaps it in.",
  anotherWayName: "Another way to say this line",
  /** The marker of a speech with `count` alternates, and its accessible name: the shown line is the first of them. */
  marker: (count: number): string => `1/${count + 1}`,
  markerName: (count: number): string => `Alternates, 1 of ${count + 1}`,
  /** After a swap; `name` is the alternate's writer, null when it is the person who swapped. */
  swapped: (name: string | null): string =>
    name === null
      ? "Swapped in your alternate."
      : `Swapped in ${name}'s alternate.`,
  printWithAlternates: "Print with alternates",
  /** Printed after each alternate's line. */
  printedMark: "(alternate)",
  moveToCuts: "Move to cuts",
  cuts: "Cuts",
  filter: "Filter…",
  clearFilter: "Clear filter",
  cutsEmpty: "Cut passages appear here so you can restore them later.",
  cutsNoMatches: "No cuts match this filter.",
  cutsMatchCount: (shown: number, total: number): string =>
    `${formatCount(shown)} of ${formatCount(total)}`,
  beforeFirstScene: "Before the first scene",
  /** After moving a selection to cuts. */
  movedToCuts: (count: number): string =>
    count === 1
      ? "Moved 1 element to cuts."
      : `Moved ${formatCount(count)} elements to cuts.`,
  /** After moving a numbered scene to cuts. */
  movedSceneToCuts: (scene: string): string => `Moved scene ${scene} to cuts.`,
  /** After moving a manuscript chapter to cuts. */
  movedChapterToCuts: "Moved chapter to cuts.",
  /** When moving to cuts would leave the script with no elements. */
  cannotCutOnly: "Cannot move the whole script to cuts.",
  /** After restoring a cut; `originGone` holds when neither its block nor its scene remains. */
  restoredFromCuts: (count: number, originGone: boolean): string =>
    originGone
      ? `Restored ${elements(count)} from cuts at the end of the script, because the place they came from is gone.`
      : `Restored ${elements(count)} from cuts.`,
  elementCount: elements,
  /** A cut row's second line when its scene heading is known. */
  cutMeta: (sceneHeading: string, count: number): string =>
    `${sceneHeading} · ${elements(count)}`,
  /** A cut row's second line before the script's first scene heading. */
  cutMetaBeforeFirst: (count: number): string =>
    `Before the first scene · ${elements(count)}`,
  restore: "Restore",
  /** The Restore button's accessible name, quoting the cut's first line when present. */
  restoreName: (firstLine: string): string => {
    const excerpt = excerptOf(firstLine);
    return excerpt === "" ? "Restore" : `Restore "${excerpt}"`;
  },
});
