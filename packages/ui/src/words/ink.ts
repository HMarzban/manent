// Words for Ink compilation, problem marks, Checks rows, and the Ink player Beside.
import { formatCount } from "./format.ts";

export const INK_WORDS = Object.freeze({
  checkProblem: (line: number, message: string): string =>
    `Line ${line}: ${message}`,
  seeLine: "See line",
  problemOnLine: (line: number): string => `Problem on line ${line}`,
  visited: "Visited",
  pressPlay: "Press Play to start the story.",
  upToDate: "Up to date",
  compiling: "Compiling…",
  problemsCount: (n: number): string =>
    n === 1 ? "1 problem" : `${formatCount(n)} problems`,
  storyChanged: "The story changed here — choose again",
  playingLastGood: "Playing the last version that compiled",
  variablesEdited: "Variables edited",
  theEnd: "The end",
  back: "Back",
  backUnavailable: "No choice to go back to.",
  restart: "Restart",
  restartUnavailable: "Nothing to restart yet.",
  variablesToggle: (n: number): string => `Variables (${formatCount(n)})`,
  play: "Play",
  playFromHere: "Play from here",
  place: (knot: string, stitch: string | null): string =>
    stitch === null ? knot : `${knot} · ${stitch}`,
  takenChoice: (text: string): string => `› ${text}`,
  besideTitle: (title: string): string => `${title} ▸ Player`,
  stoppedAtPrefix: "The story stopped at",
  lineLink: (line: number): string => `line ${line}`,
  stoppedWithoutLine: "The story stopped.",
  nothingCompiled: "Nothing has compiled yet, so there is no story to play.",
  needsCaretInKnot: "needs the caret in a knot",
  transcriptLabel: "The story so far",
  choicesLabel: "Choices",
  choiceLabel: (n: number, text: string): string => `Choice ${n}: ${text}`,
  lineDescription: (line: number): string => `Line ${line}`,
});
