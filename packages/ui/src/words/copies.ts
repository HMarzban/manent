// The words of Duplicate.
export const COPIES_WORDS = Object.freeze({
  /** The title of a copy of the script titled `title`. */
  copyTitle: (title: string): string => `${title} — copy`,
  /** `title` is the copy's. */
  notSaved: (title: string): string =>
    `Couldn't add '${title}' to the Library. Try again.`,
});
