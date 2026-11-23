// The words of the Writing switch.
export const WRITING_WORDS = Object.freeze({
  positions: Object.freeze({
    everyone: "For everyone",
    suggestions: "As suggestions",
    private: "Privately",
  }),
  /** The line under each choice of the switch. */
  positionLines: Object.freeze({
    everyone: "Everyone sees what you type as you type it.",
    suggestions: "Everyone sees it as a suggestion to accept or decline.",
    private: "Only you see it until you hand in.",
  }),
  /** The switch at the head of the people list: "Writing: For everyone ▾". */
  switchLabel: (position: string): string => `Writing: ${position} ▾`,
  /** The reason Privately cannot start on a script the server has never held. */
  needsSynced: "needs this script synced first",
  lockedBack:
    "Page numbers were locked, so you are writing for everyone again. Open suggestions stay in To review.",
});
