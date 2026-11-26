// The Send screen's words: its row labels, its pages and its way back.

export const SEND_WORDS = {
  checks: "Checks",
  name: "Name",
  what: "What",
  as: "As",
  to: "To",
  colour: "Colour",
  memo: "Memo",
  pagesRegion: "The pages as they will go",
  /** The way back to the place Send was opened from: the document's title, or "Library". */
  back: (place: string): string => `‹ ${place}`,
  /** Shown in-frame when a Send route cannot be opened for this script or role. */
  unavailableTitle: "This isn't available",
  issueNeedsLock: "Lock page numbers before issuing revisions.",
  issueNoPermission: "Only someone who can issue revisions can open this.",
  recallClosed: "There is no issued revision open to recall right now.",
  recallNoPermission:
    "Only someone who can issue revisions can recall a revision.",
  formUnavailable: "This isn't available for this script.",
  backToScript: "Back to script",
} as const;
