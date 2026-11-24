// The words of Duplicate, the Lock dialog's Try it on a copy first, and Start a … from this….
import { formatCount } from "./format.ts";

export type StartFromTarget = "film" | "episode" | "stage_play";

const TARGET_NOUN: Readonly<Record<StartFromTarget, string>> = Object.freeze({
  film: "film",
  episode: "episode",
  stage_play: "stage play",
});

const TARGET_ARTICLE: Readonly<Record<StartFromTarget, string>> = Object.freeze(
  {
    film: "a film",
    episode: "an episode",
    stage_play: "a stage play",
  },
);

export const COPIES_WORDS = Object.freeze({
  /** The title of a copy of the script titled `title`. */
  copyTitle: (title: string): string => `${title} — copy`,
  /** `title` is the copy's. */
  notSaved: (title: string): string =>
    `Couldn't add '${title}' to the Library. Try again.`,
  tryOnCopy: "Try it on a copy first",
  /** The Lock dialog's busy label while the copy is made and opened beside the page. */
  copying: "Copying…",
  /** `title` is the copy's; the message's action is `openBeside`. */
  copyLocked: (title: string): string =>
    `Made a copy, '${title}', and locked its page numbers. The original is unchanged.`,
  openBeside: "Open beside",
  /** Above the Lock dialog's buttons; `title` is the copy's. */
  copyLockRefused: (title: string): string =>
    `Couldn't lock the copy's page numbers. The copy is kept as '${title}'.`,
  /** The title of a new project and script started from `title`. */
  startFromTitle: (title: string, target: StartFromTarget): string =>
    `${title} — ${TARGET_NOUN[target]}`,
  /** After starting a film or stage play from a book. */
  startedFromBook: (
    target: StartFromTarget,
    sourceTitle: string,
    chapters: number,
  ): string =>
    `Started ${TARGET_ARTICLE[target]} from '${sourceTitle}': ${
      chapters === 1
        ? "1 scene heading"
        : `${formatCount(chapters)} scene headings`
    }, one for each chapter. The book is unchanged.`,
  /** After starting a film, episode or stage play from another script. */
  startedFromScript: (target: StartFromTarget, sourceTitle: string): string =>
    `Started ${TARGET_ARTICLE[target]} from '${sourceTitle}'. The original is unchanged.`,
  /** When starting a new project from `sourceTitle` could not be saved or read. */
  startFromRefused: (target: StartFromTarget, sourceTitle: string): string =>
    `Couldn't start ${TARGET_ARTICLE[target]} from '${sourceTitle}'. Try again.`,
  /** The source script's state bar while open beside the page. */
  sourceReadOnly: "Read-only here — open it to edit",
});
