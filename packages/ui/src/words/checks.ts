// The words of Checks, in Details and at the top of Send: headings, check sentences, Flag and its people list.

import { formatCount } from "./format.ts";

export const CHECKS_WORDS = Object.freeze({
  /** "Checks (2)" while `n` things need a look, "Checks" when none does. */
  heading: (n: number): string =>
    n > 0 ? `Checks (${formatCount(n)})` : "Checks",
  nothing: "Nothing needs a look before you send.",
  /** New character cue or new proper noun with no sent draft. */
  newName: (name: string): string =>
    `"${name}" is new and not in the project's names`,
  /** A run that nearly matches a listed project name. */
  nearMatch: (found: string, listed: string): string =>
    `"${found}" nearly matches "${listed}" in the project's names`,
  /** A word used repeatedly in the script. */
  overusedWord: (word: string, count: number): string =>
    `"${word}" is used ${formatCount(count)} times`,
  /** Page count above the project's target length. */
  pagesOverTarget: (pages: number, over: number, target: number): string =>
    `${formatCount(pages)} pages, ${formatCount(over)} over the target of ${formatCount(target)}`,
  /** A proper noun absent from the last sent draft named `draftName`. */
  newProperNounSince: (word: string, draftName: string): string =>
    `"${word}" is new since '${draftName}'`,
  flag: "Flag",
  flagHeading: "Flag for someone",
  flagEmpty: "No one else can comment on this script.",
  flaggedFor: (firstName: string): string => `Flagged for ${firstName}`,
  flaggedMessage: (subject: string, firstName: string): string =>
    `Flagged "${subject}" for ${firstName}.`,
});
