// Words for Rename character, Read aloud, daily writing goals, timed sprints, Numbers, reports, near-duplicate locations and Pickup lines.
import { formatCount, joinNames } from "./format.ts";

const wordCount = (n: number): string =>
  n === 0 ? "no words" : n === 1 ? "1 word" : `${formatCount(n)} words`;

const speechCount = (n: number): string =>
  n === 1 ? "1 speech" : `${formatCount(n)} speeches`;

const dialogueWordCount = (n: number): string =>
  n === 1 ? "1 word" : `${formatCount(n)} words`;

const goalCount = (
  done: number,
  target: number,
  kind: "pages" | "words",
): string => {
  const unit =
    kind === "pages"
      ? target === 1
        ? "page"
        : "pages"
      : target === 1
        ? "word"
        : "words";
  return `${formatCount(done)} of ${formatCount(target)} ${unit}`;
};

export const WRITING_TOOLS_WORDS = Object.freeze({
  renameCharacter: "Rename character",
  renameWhich: "Rename which character?",
  renameNewName: (name: string): string => `New name for ${name}`,
  renamed: (from: string, to: string, count: number): string =>
    `Renamed ${from} to ${to} in ${count} ${count === 1 ? "cue" : "cues"}.`,
  needsCharacter: "needs a character in the script",
  undo: "Undo",
  readAloud: "Read aloud",
  readAloudNoVoice: "needs an English voice on this device",
  goal: "Goal",
  goalScope: "Yours, on this script",
  goalEmpty:
    "No goal yet. Set how many pages or words to write each day, and the status bar keeps count.",
  goalEachDay: "Each day",
  goalPages: "Pages",
  goalWords: "Words",
  goalRemove: "Remove goal",
  goalReached: "Goal reached",
  goalReadout: goalCount,
  goalTooltip: (
    done: number,
    target: number,
    kind: "pages" | "words",
  ): string => `Goal for today: ${goalCount(done, target, kind)}`,
  sprintStart: "Start sprint",
  sprintRemaining: (time: string): string => `Sprint · ${time}`,
  sprintEnd: "End",
  sprintPrompt: "Sprint for how many minutes?",
  sprintChoice: (minutes: number): string => `${minutes} minutes`,
  sprintOver: (words: number, duration: string): string =>
    `Sprint over: ${wordCount(words)} in ${duration}.`,
  sprintEnded: (words: number, elapsed: string): string =>
    `Ended the sprint: ${wordCount(words)} in ${elapsed}.`,
  sprintAlreadyOn: "isn't available while a sprint is on",
  sprintStartDisabled: "Start sprint isn't available while a sprint is on.",
  numbers: "Numbers",
  reports: "Reports…",
  numbersPages: "Pages",
  numbersScenes: "Scenes",
  numbersChapters: "Chapters",
  numbersWords: "Words",
  numbersEstimatedRuntime: "Estimated runtime",
  numbersRuntimeNote: "An estimate: one minute a page.",
  numbersReadingTimeNote: (duration: string): string =>
    `Estimated reading time: ${duration} (at 250 words a minute).`,
  numbersEighths: "Eighths",
  numbersChapterTargets: "Chapter targets",
  numbersChaptersOnTarget: (done: number, total: number): string =>
    `${formatCount(done)} of ${formatCount(total)} on target`,
  numbersChapterProgress: (words: number, target: number): string =>
    `${formatCount(words)} / ${formatCount(target)}`,
  numbersScene: (number: string): string => `Sc. ${number}`,
  numbersDialogueByCharacter: "Dialogue by character",
  numbersCharacterSummary: (speeches: number, words: number): string =>
    `${speechCount(speeches)} · ${dialogueWordCount(words)}`,
  numbersNoDialogue: "No dialogue yet",
  numbersShowAll: (count: number): string => `Show all (${formatCount(count)})`,
  numbersShowFewer: "Show less",
  characterReportCsv: "Character report (CSV)",
  characterReportPdf: "Character report (PDF)",
  sceneReportCsv: "Scene report (CSV)",
  sceneReportPdf: "Scene report (PDF)",
  locationReportCsv: "Location report (CSV)",
  locationReportPdf: "Location report (PDF)",
  reportColName: "Name",
  reportColSpeeches: "Speeches",
  reportColDialogueWords: "Dialogue words",
  reportColScenes: "Scenes",
  reportColFirstPage: "First page",
  reportColNumber: "Number",
  reportColHeading: "Heading",
  reportColPage: "Page",
  reportColLength: "Length",
  reportColCharacters: "Characters",
  reportColLocation: "Location",
  reportColInteriorOrExterior: "Interior or exterior",
  reportColPages: "Pages",
  reportHeadingCharacters: (title: string): string =>
    `Characters in '${title}'`,
  reportHeadingScenes: (title: string): string => `Scenes in '${title}'`,
  reportHeadingLocations: (title: string): string => `Locations in '${title}'`,
  nearDuplicateLocations: (spellings: readonly string[]): string =>
    `${joinNames(spellings)} look like one location`,
  merge: "Merge",
  mergedLocations: (
    froms: readonly string[],
    to: string,
    count: number,
  ): string =>
    `Merged ${joinNames(froms)} into ${to} in ${count === 1 ? "1 scene heading" : `${formatCount(count)} scene headings`}.`,
  pickupLinesCsv: "Pickup lines (CSV)",
  pickupLinesNeedsRecord: "Pickup lines (CSV) — needs a draft named Record",
  pickupColCharacter: "Character",
  pickupColLine: "Line",
  pickupColPage: "Page",
  pickupLinesNoneChanged: (draftName: string): string =>
    `No dialogue has changed since '${draftName}'`,
});
