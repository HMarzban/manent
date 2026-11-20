// What the desktop app says before any page exists: the alert and the terminal line for scripts a newer build wrote.

export const SHELL_WORDS = {
  newerStoreTitle: "Update Manent to open your scripts",
  newerStoreBody:
    "The scripts on this computer were last opened by a newer Manent. This one can't read them and has changed nothing.",
  /** Opens the repository's releases page in the system browser, then quits: the alert's default button. */
  getLatest: "Get the latest Manent",
  /** The alert's cancel button. */
  quit: "Quit",
  /** Printed on stderr as well as the alert. */
  newerStoreLine: "Manent cannot open data from a newer version.",
} as const;
