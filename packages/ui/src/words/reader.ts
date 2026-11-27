// The words of the reader frame (`/r/$token`): refusals, state bar, offline cache, changes since last read and commenting.
import { formatCount, joinNames } from "./format.ts";

export const READER_WORDS = Object.freeze({
  canComment: "View only — you can comment",
  sinceLastRead: "Changes since you last read",
  needsEarlierRead: "needs a draft you read before",
  sinceLastReadUnavailable:
    "Changes since you last read — needs a draft you read before",
  sinceLastReadReasonMessage:
    "Changes since you last read needs a draft you read before.",
  linkExpired: "This link has expired. Ask the sender for a new link.",
  linkRevoked: "This link no longer works. Ask the sender for a new link.",
  notSent: "This draft wasn't sent to you. Ask the sender to send it to you.",
  noChangesSinceLastRead: "Nothing has changed since you last read.",
  pagesChangedSinceLastRead: (pages: readonly string[]): string => {
    if (pages.length === 0) return "Nothing has changed since you last read.";
    if (pages.length === 1)
      return `1 page changed since you last read: p. ${pages[0]}.`;
    return `${formatCount(pages.length)} pages changed since you last read: pp. ${joinNames(pages)}.`;
  },
  /** `dayDate` as `${formatDay(at)} ${formatDate(at)}`: "Mon 16 Nov". */
  offlineCopy: (dayDate: string): string =>
    `Offline — showing the copy you opened ${dayDate}`,
  chooseToComment: (title: string): string =>
    `Choose who you are to comment on '${title}'.`,
  addAnotherComment: "New comment",
});
