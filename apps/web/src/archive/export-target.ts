// The project whose row menu Export… was chosen on, for the command run straight after.

let chosen: string | null = null;

export const exportTarget: {
  /** The project's first document, once; null when no row chose one since. */
  take(): string | null;
  set(firstDocId: string): void;
} = Object.freeze({
  take: () => {
    const docId = chosen;
    chosen = null;
    return docId;
  },
  set: (firstDocId: string) => {
    chosen = firstDocId;
  },
});
