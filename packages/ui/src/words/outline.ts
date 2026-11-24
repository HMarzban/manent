// The outline document's words: Open beside's entry and header, empty state, state bar and Start script from outline.
import { formatCount } from "./format.ts";

export const OUTLINE_WORDS = Object.freeze({
  /** Open beside's entry for the script's or episode's outline. */
  outline: "Outline",
  /** Beside's header title for an outline. */
  besideTitle: (title: string): string => `${title} · Outline`,
  /** Empty outline hint. */
  empty:
    "Write the episode in prose. Each beat is a scene heading with its synopsis.",
  /** Command label and state-bar button. */
  startScript: "Start script from outline",
  /** State bar on an empty script whose outline has beats. */
  stateBar: (beats: number): string =>
    beats === 1
      ? "This script's outline has 1 beat"
      : `This script's outline has ${formatCount(beats)} beats`,
  /** Message slot after Start script from outline. */
  started: (count: number): string =>
    count === 1
      ? "Started the script from its outline: 1 scene heading."
      : `Started the script from its outline: ${formatCount(count)} scene headings.`,
  /** Reverse action on the Start script from outline message. */
  undo: "Undo",
  /** Reason Start script from outline cannot run. */
  startReason: "needs an empty script whose outline has beats",
});
