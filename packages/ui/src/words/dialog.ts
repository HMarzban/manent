// The words of the consequence dialog.

export const DIALOG_WORDS = {
  cancel: "Cancel",
  tryAgain: "Try again",
  stillWorking: "Still working…",
  /** A disabled action's line, and the message of a command that is unavailable: "Issue Pink needs a connection." */
  disabledLine: (label: string, reason: string): string =>
    `${label.replace(/…$/, "")} ${reason}.`,
} as const;
