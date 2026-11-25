// Words for Rename character, Read aloud, daily writing goals, and timed sprints on the Script menu.
import { formatCount } from "./format.ts";

const wordCount = (n: number): string =>
  n === 0 ? "no words" : n === 1 ? "1 word" : `${formatCount(n)} words`;

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
  goalReadout: goalCount,
  goalTooltip: (
    done: number,
    target: number,
    kind: "pages" | "words",
  ): string => `Goal for today: ${goalCount(done, target, kind)}`,
  sprintStart: "Start sprint",
  sprintPrompt: "Sprint for how many minutes?",
  sprintChoice: (minutes: number): string => `${minutes} minutes`,
  sprintOver: (words: number, duration: string): string =>
    `Sprint over: ${wordCount(words)} in ${duration}.`,
  sprintEnded: (words: number, elapsed: string): string =>
    `Ended the sprint: ${wordCount(words)} in ${elapsed}.`,
  sprintAlreadyOn: "isn't available while a sprint is on",
  sprintStartDisabled: "Start sprint isn't available while a sprint is on.",
});
