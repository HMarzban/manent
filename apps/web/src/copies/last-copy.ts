// The last copy this tab made, which "Open beside" on the message about it opens; light, as the entry reads it.

let last: string | null = null;

/** The copy's doc id; null before this tab has made one. */
export const lastCopy: {
  get(): string | null;
  set(docId: string): void;
} = Object.freeze({
  get: () => last,
  set: (docId: string) => {
    last = docId;
  },
});
