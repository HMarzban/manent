// The words of a link to a script or a version: the message after copying one, and what opening one can say.
export const LINKS_WORDS = Object.freeze({
  copiedScript: (title: string): string => `Copied a link to '${title}'.`,
  /** `ref` is the version inside a sentence, as `versionRef` writes it. */
  copiedVersion: (ref: string): string => `Copied a link to ${ref}.`,
  /** `ref` is the version open as it was, as `versionRef` writes it. */
  comparedEarlier: (ref: string): string =>
    `This link compared two earlier versions, so ${ref} is open as it was.`,
  notInHistory:
    "Couldn't open this link: that version is not in this script's history.",
});
