// The words of Ink and Game Script exports, Print's Ink reason, and .ink file import.
import { formatCount, joinNames } from "./format.ts";

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? `1 ${one}` : `${formatCount(n)} ${many}`;

export const GAME_EXPORTS_WORDS = Object.freeze({
  lineDataJson: "Line data (JSON)",
  lineDataXml: "Line data (XML)",
  inkNoPrint: "isn't part of the Ink format",
  inkSource: "Ink",
  inkProject: "Whole project as Ink",
  inkJson: "Compiled Ink (JSON)",
  joinedProblem: (line: number, message: string): string =>
    `! Line ${line} of the joined file: ${message}`,
  joinedProblemsNotice: (n: number): string =>
    n === 1
      ? "The joined file has 1 problem, listed in Checks. It is written as it is."
      : `The joined file has ${formatCount(n)} problems, listed in Checks. It is written as it is.`,
  missingFromDevice: (titles: readonly string[]): string =>
    titles.length === 1
      ? `'${titles[0]}' isn't on this device, so the file leaves it out.`
      : `${joinNames(titles.map((title) => `'${title}'`))} aren't on this device, so the file leaves them out.`,
  inkNotUtf8: (name: string): string =>
    `Couldn't open '${name}': it isn't saved as UTF-8 text.`,
  importedInk: (title: string, lines: number, knots: number): string => {
    const lineCount = plural(lines, "line", "lines");
    if (knots === 0) return `Imported '${title}': ${lineCount}.`;
    return `Imported '${title}': ${lineCount}, ${plural(knots, "knot", "knots")}.`;
  },
});
