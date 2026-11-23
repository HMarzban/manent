// What the comments feature is told and asks outside its document: open counts per round, and who a draft was sent to.

/** A round of a comments document, and how many of its threads are open. `createdAt` is milliseconds since the epoch. */
export interface RoundOpenCount {
  roundId: string;
  name: string;
  createdAt: number;
  open: number;
}

/** Where the open counts of a comments document's rounds go after each committed write to its threads or rounds. */
export interface RoundCounts {
  /** `docId` is the comments document's; `rounds` is every round it holds, by id ascending. */
  counted(docId: string, rounds: readonly RoundOpenCount[]): void;
}

/** The counts reach nobody. */
export const NO_ROUND_COUNTS: RoundCounts = Object.freeze({
  counted: () => {},
});

/** Who a draft was sent to: a signed-in person sent a draft of a script comments on it as Can comment. */
export interface DraftReaders {
  /** Whether a draft of the script `docId` was sent to `userId`. */
  isDraftReader(userId: string, docId: string): boolean;
}

/** Nobody was sent a draft. */
export const NO_DRAFT_READERS: DraftReaders = Object.freeze({
  isDraftReader: () => false,
});
