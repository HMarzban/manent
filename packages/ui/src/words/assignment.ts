// The words of scene assignment: Details → Scene → Writer, the scene row menu and the Scenes rows.

export const ASSIGNMENT_WORDS = Object.freeze({
  writer: "Writer",
  noWriter: "No writer",
  progress: "Progress",
  /** Each scene's progress, by the value the script stores. */
  progressNames: Object.freeze({
    not_started: "Not started",
    drafting: "Drafting",
    handed_in: "Handed in",
  }),
  /** A Scenes row's writer and the scene's progress: "Sam · Drafting". */
  sceneMark: (name: string, progress: string): string =>
    `${name} · ${progress}`,
});
