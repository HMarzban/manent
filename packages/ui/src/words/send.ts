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
} as const;
