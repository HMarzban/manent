// The words of Duplicate, and of the Lock dialog's Try it on a copy first.
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
});
