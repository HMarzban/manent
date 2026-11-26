// The words of a link to a script or a version: the message after copying one, and what opening one can say.
export const LINKS_WORDS = Object.freeze({
  copiedScript: (title: string): string => `Copied a link to '${title}'.`,
  /** `ref` is the version inside a sentence, as `versionRef` writes it. */
  copiedVersion: (ref: string): string => `Copied a link to ${ref}.`,
  /** `ref` is the baseline version inside a sentence, as `versionRef` writes it. */
  copiedChanges: (ref: string): string =>
    `Copied a link to the changes since ${ref}.`,
  /** `name` is the name of the version open as it was. */
  comparedEarlier: (name: string): string =>
    `This link compared two earlier versions, so '${name}' is open as it was.`,
  notInHistory:
    "Couldn't open this link: that version is not in this script's history.",
  linkUnavailable: "This link can't be opened",
  versionUnavailable: "Version not in history",
  backToLibrary: "Back to Library",
  openScript: "Open this script",
});
