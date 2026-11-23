// The demo bar's words. The server's words and "Chosen" are the web app's own. A `…Hint` is a control's tooltip
// while it can act: what it does, which its label does not say.
import { formatCount } from "./format.ts";

export const DEMO_WORDS = {
  /** Shown in capitals by the stylesheet; also the bar region's accessible name. */
  demo: "Demo",
  person: (name: string): string => `Person: ${name}`,
  tour: "Tour",
  /** The Connection control and its three choices. */
  connection: "Connection",
  online: "Online",
  offline: "Offline",
  slow: "Slow",
  /** The control: a popover holding the choice of 1, 5 or 20 under its line and, while writers run, Stop writers. */
  addWriters: "Add writers",
  addWritersHint:
    "Demo writers type in this script, each in a scene of its own.",
  writersChoice: "Writers typing in other scenes",
  stopWriters: "Stop writers",
  /** The control's label while they run. */
  writersTyping: (n: number): string =>
    n === 1 ? "1 writer typing" : `${formatCount(n)} writers typing`,
  writersShort: (count: number, asked: number): string =>
    `${formatCount(count)} of ${formatCount(asked)} writers typing — each needs a scene of its own`,
  /** Reason clauses, for READOUT_WORDS.unavailable. */
  needsScript: "needs a script open",
  needsConnection: "needs a connection",
  needsEdit: "needs edit access",
  /** The button's label is the web app's own. */
  stopServerHint:
    "Stops the server at once. Nothing synced is lost, and each window connects again by itself.",
  timings: "Timings",
  timingsHint:
    "This window's typing, pagination and sync times, measured live.",
  timingRows: [
    "Keystroke to frame",
    "Pagination time",
    "Sync round trip",
    "Document size",
  ],
  /** Milliseconds with one decimal: "p50 6.0 ms · p95 8.0 ms · 200 samples". */
  stats: (p50: number, p95: number, n: number): string =>
    `p50 ${p50.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · ${n === 1 ? "1 sample" : `${formatCount(n)} samples`}`,
  /** Kilobytes, with one decimal under 10. */
  bytes: (kb: number): string =>
    `${kb < 10 ? kb.toFixed(1) : formatCount(Math.round(kb))} KB`,
  nothingMeasured: "—",
  timingsNote: "Measured in this window while Timings is open.",
  reorganise: "Reorganise",
  reorganiseHint:
    "Asks the server to reorganise how this script is stored, as it does when a script gets long.",
  /** The control's label and tooltip from the press until the script's message says it is done. */
  reorganiseWaiting: "Waiting to reorganise…",
  reorganiseWaitingHint: "Starts once no one is typing in this script.",
  /** The control and its tooltip; its consequence dialog's title, its confirming button (drawn destructive) and its body. */
  reset: "Reset",
  resetHint:
    "Every workspace goes back to its seeded state, for everyone using this demo.",
  resetTitle: "Reset the demo?",
  resetAction: "Reset the demo",
  resetBody:
    "Every workspace goes back to its seeded state for everyone using this demo. Changes made since it was seeded are not kept. Each browser and the desktop app clear their copies when they next connect.",
  /** The workspace switcher's second line for a workspace whose seed stopped. */
  seedingFailed: "Couldn't get ready. Run make reset to try again.",
} as const;
