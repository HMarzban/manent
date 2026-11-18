// The Tour panel's words.

import { formatCount } from "./format.ts";

export const TOUR_WORDS = {
  title: "Tour",
  setItUp: "Set it up",
  setItUpAgain: "Set it up again",
  whatToCheck: "What to check",
  setupFailed: "Couldn't set this up.",
  setupUnreachable:
    "Couldn't reach Manent. Start the server, then set it up again.",
  setupUsed:
    "This has already been done in this demo. Reset the demo to do it again.",
  setupSeeding: (workspace: string, done: number, total: number): string =>
    `${workspace} is getting ready, ${formatCount(done)} of ${formatCount(total)} projects. This opens when it is ready.`,
  desktopOnly:
    "This one needs the desktop app. Run make desktop, then open the Tour there.",
} as const;
