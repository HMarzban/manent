// The Tour panel's words.

import { LIBRARY_WORDS } from "./library.ts";

export const TOUR_WORDS = {
  setItUp: "Set it up",
  setItUpAgain: "Set it up again",
  whatToCheck: "What to check",
  nowPerson: (name: string): string =>
    `This tab is now ${name}, the person this part of the Tour is for.`,
  setupFailed: "Couldn't set this up.",
  setupUnreachable:
    "Couldn't reach Manent. Start the server, then set it up again.",
  setupUsed:
    "This has already been done in this demo. Reset the demo to do it again.",
  setupSeeding: (workspace: string, done: number, total: number): string =>
    `${LIBRARY_WORDS.gettingReady(workspace, done, total)} This opens when it is ready.`,
  setupSeedingFailed: (workspace: string): string =>
    `${workspace} couldn't get ready. Reset the demo to try again.`,
  desktopOnly:
    "This one needs the desktop app. Run make desktop, then open the Tour there.",
} as const;
