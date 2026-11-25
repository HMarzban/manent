// Words for Ink compilation, problem marks, and Checks rows.
export const INK_WORDS = Object.freeze({
  checkProblem: (line: number, message: string): string =>
    `Line ${line}: ${message}`,
  seeLine: "See line",
  problemOnLine: (line: number): string => `Problem on line ${line}`,
  visited: "Visited",
});
