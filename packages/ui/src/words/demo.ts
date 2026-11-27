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
  /**
   * The control: a popover holding two choices of 1, 5 or 20, in other scenes and in the caret's scene, each under
   * its line, and, while writers run, Stop writers.
   */
  addWriters: "Add writers",
  addWritersHint:
    "Demo writers type in this script, each in a scene of its own or all in the scene you are in.",
  writersChoice: "Writers typing in other scenes",
  writersHereChoice: "Writers typing in this scene",
  writersOtherScenes: "Other scenes",
  writersThisScene: "This scene",
  writersWhereLabel: "Where writers type",
  stopWriters: "Stop writers",
  /** The control's label while they run. */
  writersTyping: (n: number): string =>
    n === 1 ? "1 writer typing" : `${formatCount(n)} writers typing`,
  writersShort: (count: number, asked: number): string =>
    `${formatCount(count)} of ${formatCount(asked)} writers typing — each needs a scene of its own`,
  /** Reason clauses, for READOUT_WORDS.unavailable. */
  needsScript: "needs a script open",
  needsConnection: "needs a connection",
  needsServer: "needs the server running",
  needsEdit: "needs edit access",
  /** For a person who has not signed in, whose scripts are only on their device. */
  needsSyncedScript: "needs a synced script",
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
  timingsNote: "Measured in this window since it opened.",
  /** The control and its tooltip; its consequence dialog's title, its confirming button (drawn destructive) and its body. */
  reset: "Reset",
  resetHint:
    "Every workspace goes back to its seeded state, for everyone using this demo.",
  resetTitle: "Reset the demo?",
  resetAction: "Reset the demo",
  /** The server line, and the heading of what stands in for the screen, from the press until the demo is back. */
  resetting: "Resetting the demo…",
  resettingBody:
    "Every workspace goes back to its seeded state. This tab reloads once the demo is ready.",
  resetBody:
    "Every workspace goes back to its seeded state for everyone using this demo. Changes made since it was seeded are not kept. Each browser and the desktop app clear their copies when they next connect.",
  /** The workspace switcher's second line for a workspace whose seed stopped. */
  seedingFailed: "Couldn't get ready. Reset the demo to try again.",
  /** Studio Stage toolbar: zero-learning-curve storytelling, live timings instrument and three-tier Demo controls. */
  chooseStageHint:
    "Pick a person to start — open a second tab at any time to see changes merge live.",
  tryProof: "Try it live",
  proofLab: "Demo controls",
  proofLabSubtitle: "Each control placed by what it can affect.",
  scopeWindow: "01 · This window",
  scopeWindowHint: "This tab only",
  scopeScript: "02 · This script",
  scopeScriptHint: "This script only",
  scopeAll: "03 · Every window",
  scopeAllHint: "Shared",
  switchDesk: "Switch person",
  allPeople: "All demo people…",
  openSecondWindow: (name: string): string => `Open a second window as ${name}`,
  openSecondWindowHint: "See live cursors and changes merge side by side.",
  popupBlocked: "Allow pop-ups to open a second window, or open a new tab.",
  live: "Live",
  localLabel: "on this device",
  reconnect: "Go online",
  backToNormal: "Normal",
  connectionHeading: "This window's connection",
  offlineBanner: "Offline — changes stay saved on this device",
  slowBanner: "Slow connection — typing stays fast on this device",
  speedHeading: "Live timings",
  speedBudget: "Frame limit: 16.6 ms",
  speedNote:
    "Typing and pagination stay on this device — they never need the server or a connection.",
  pausedOffline: "Paused offline",
  pausedServer: "Paused while the server is stopped",
  openScriptPrompt: "Open a script",
  needsScriptLab: "Open any script to try live writers.",
  hideDemoBar: "Hide demo bar",
  showDemoBar: "Show demo bar",
  writersRefused: "Couldn't change demo writers right now.",
  serverRefused: "Couldn't reach the demo right now.",
  resetRefused: "Couldn't reach the demo to reset.",
  resettingAction: "Resetting…",
  allWindowsNote: "Applies to every open window and the desktop app.",
  serverLive: "Server running",
  serverPaused: "Server stopped",
  stop: "Stop",
  msShort: (ms: number): string => `${ms.toFixed(1)} ms`,
  /** Concept A Smart Director's Rail + Unified Stage Sheet + Story Tracks. */
  stageTabControls: "Demo controls",
  stageTabTours: "Tour",
  chooseTourHeading: "Choose a tour",
  highlightsVerified: (done: number, total: number): string =>
    `${formatCount(done)} of ${formatCount(total)} highlights verified`,
  trackParts: (count: number): string =>
    count === 1 ? "1 part" : `${formatCount(count)} parts`,
  trackProgress: (done: number, total: number): string =>
    `${formatCount(done)} of ${formatCount(total)} verified`,
  allTourParts: (total: number): string =>
    `See all ${formatCount(total)} Tour parts`,
  trackOverviewTitle: "Highlights",
  trackOverviewBody:
    "Pages as they print, live writers, room views, offline writing, locked page numbers and live rundowns.",
  trackScreenwriterTitle: "Writing and export",
  trackScreenwriterBody:
    "Pages as they print, outlines, character rename and PDF export.",
  trackShowrunnerTitle: "Showrunner and room",
  trackShowrunnerBody: "The Board, live cursors, comments and Room window.",
  trackCoordinatorTitle: "Production and locks",
  trackCoordinatorBody:
    "Lock page numbers, edit a locked page, issue Blue pages and export sides.",
  trackBroadcastTitle: "Broadcast and news",
  trackBroadcastBody:
    "Live show timing, prompter display, story sends and prompter control.",
  trackGameTitle: "Game and Ink",
  trackGameBody:
    "Game script elements, game lines and a live Ink story beside your script.",
  trackResilienceTitle: "Offline and long scripts",
  trackResilienceBody:
    "Offline review, server stops, twenty writers and a long book.",
  quickSecondWindow: "Second window",
  quickFiveWriters: "5 writers",
  quickPrompter: "Prompter",
  quickDropFeed: "Drop feed",
  quickPlayInk: "Play Ink",
  quickIssuePages: "Issue pages",
  missionStart: "Start",
  missionTry: "Try",
  missionNext: "Next",
  verifiedOffline: "Verified: offline changes synced",
  verifiedWriters: (ms: string, count: number): string =>
    `Verified: ${ms} with ${formatCount(count)} writers`,
  verifiedServer: "Verified: kept everything while server stopped",
  openInNewTab: "Open in a new tab",
  continueTrack: (title: string): string => `Next in ${title}`,
  tryFormatsHeading: "Jump to a format",
  formatBook: "Book",
  formatStagePlay: "Stage play",
  formatMulticam: "Multi-camera",
  formatAnimation: "Animation",
  formatPodcast: "Podcast",
  formatBroadcastGraphics: "Graphics",
} as const;
