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
  setupPopupBlocked:
    "Your browser blocked the second window. Allow pop-ups for this address, then set it up again.",
  setupSeeding: (workspace: string, done: number, total: number): string =>
    `${LIBRARY_WORDS.gettingReady(workspace, done, total)} This opens when it is ready.`,
  setupSeedingFailed: (workspace: string): string =>
    `${workspace} couldn't get ready. Reset the demo to try again.`,
  desktopOnly:
    "This one needs the desktop app. Run make desktop, then open the Tour there.",
  progressLabel: "Tour progress",
  progress: (ticked: number, total: number): string =>
    total > 0 && ticked === total
      ? `All ${total} ticked`
      : `${ticked} of ${total} ticked`,
  filterLabel: "Show",
  filterAll: "All",
  filterHighlights: "Highlights",
  filterRemaining: "To try",
  inProgress: "In progress",
  continueAction: "Continue",
  allParts: "All parts",
  previous: "Previous",
  next: "Next",
  markTicked: "Mark ticked",
  markTickedAndNext: "Mark ticked and next",
  ticked: "Ticked",
  windows: (count: number): string => `${count} windows`,
  desktopApp: "Desktop app",
  ofSteps: (at: number, total: number): string => `${at} of ${total}`,
  tabBecomes: (name: string): string => `This tab becomes ${name}`,
  opensWindow: (name: string): string => `Opens ${name} in another window`,
  tabAndWindow: (name: string, other: string): string =>
    `This tab becomes ${name}, and ${other} opens in another window`,
  inWindow: (name: string): string => `In ${name}'s window`,
  openTour: "Open Tour",
  closeFloating: "Close",
  allTickedTitle: "Nothing left to try",
  allTickedBody: "You have ticked every part of the Tour.",
  showAll: "Show all",
} as const;
