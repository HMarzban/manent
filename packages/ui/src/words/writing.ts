// The words of the Writing switch, the Hand in view and its dialog, and what is said after a hand-in.
import { formatCount } from "./format.ts";

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? `1 ${one}` : `${formatCount(n)} ${many}`;

const scenes = (n: number): string => plural(n, "scene", "scenes");

export const WRITING_WORDS = Object.freeze({
  positions: Object.freeze({
    everyone: "For everyone",
    suggestions: "As suggestions",
    private: "Privately",
  }),
  /** The line under each choice of the switch. */
  positionLines: Object.freeze({
    everyone: "Everyone sees what you type as you type it.",
    suggestions: "Everyone sees it as a suggestion to accept or decline.",
    private: "Only you see it until you hand in.",
  }),
  /** The switch at the head of the people list: "Writing: For everyone". */
  switchLabel: (position: string): string => `Writing: ${position}`,
  /** The reason Privately cannot start on a script the server has never held. */
  needsSynced: "needs this script synced first",
  /** The reason Privately cannot start offline. */
  needsConnection: "needs a connection",
  lockedBack:
    "Page numbers were locked, so you are writing for everyone again. Open suggestions stay in To review.",
  leftPrivately: (n: number): string =>
    `You are writing for everyone now. Your private changes to ${scenes(n)} are kept; choose Privately to go back to them.`,
  handInHeading: "Changes to hand in",
  handInLoading: "Checking changes to hand in…",
  tryAgain: "Try again",
  handInLine: (n: number): string =>
    `${scenes(n)} changed since you started writing privately.`,
  /** One scene of the Hand in view: "Sc. 4 · 12 changes". */
  handInRow: (scene: string, n: number): string =>
    `Sc. ${scene} · ${plural(n, "change", "changes")}`,
  handIn: "Hand in",
  keepWriting: "Keep writing",
  nothingToHandIn: "Nothing to hand in yet.",
  handInUnavailable:
    "Couldn't compare your private copy right now. Keep writing or try again shortly.",
  needsChange: "needs a change",
  handInTitle: (n: number): string => `Hand in ${scenes(n)}?`,
  handInBody: (n: number, title: string): string =>
    `Your changes to ${scenes(n)} join '${title}' for everyone on it. The script as it is now is kept as 'Before hand-in', and any passage someone else also changed is listed under To review.`,
  handInAction: (n: number): string => `Hand in ${scenes(n)}`,
  handingIn: (n: number): string => `Handing in ${scenes(n)}…`,
  handInRefusals: Object.freeze({
    failed: "Couldn't hand in your changes. Try again.",
    already_handed_in:
      "Couldn't hand in: these changes were handed in already.",
    no_private_copy: "Couldn't hand in: nothing is waiting to hand in.",
  }),
  handedIn: (n: number, overlaps: number): string =>
    overlaps === 0
      ? `Handed in ${scenes(n)}. The script as it was is kept as 'Before hand-in'.`
      : `Handed in ${scenes(n)}. ${overlaps === 1 ? "1 passage is" : `${formatCount(overlaps)} passages are`} listed under To review, and the script as it was is kept as 'Before hand-in'.`,
  restoreBeforeHandIn: "Restore 'Before hand-in'",
  /** The version kept of the script just before a hand-in. */
  beforeHandIn: "Before hand-in",
  review: "Review",
  handedInBy: (name: string, n: number): string =>
    `${name} handed in ${scenes(n)}.`,
  seeWhatChanged: "See what changed",
  /** The Library row's line while the person writes the script privately. */
  rowLine: (n: number): string =>
    n === 0 ? "Writing privately" : `Writing privately · ${scenes(n)} changed`,
  /** Shown when a browser-only session opens a script that is not stored on this device. */
  notOnDeviceBody: "This script is not on this device.",
  choosePerson: "Choose a person",
  backToLibrary: "Back to Library",
  reviewRounds: "Review rounds",
});
