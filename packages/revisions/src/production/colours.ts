/** Every paper a revision is issued on; the interface's RevisionColour is the same list. */
export const REVISION_COLOURS = [
  "white",
  "blue",
  "pink",
  "yellow",
  "green",
  "goldenrod",
  "buff",
  "salmon",
  "cherry",
  "tan",
] as const;
export type RevisionColour = (typeof REVISION_COLOURS)[number];
