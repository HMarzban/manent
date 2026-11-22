// The Tour's Desktop scenarios, in the order the Tour shows them.
import { docPath } from "../../seed/catalogue.ts";
import type { TourScenario } from "../format.ts";

const SLACK_WATER = docPath("medium/harbour-lights/205");

export const DESKTOP: readonly TourScenario[] = [
  {
    id: "desktop-offline",
    group: "Desktop",
    promise:
      "Write in the desktop app with no network; everything is there when it comes back.",
    setup: {
      userId: "sam",
      open: SLACK_WATER,
      extraWindows: [],
      prepare: null,
      shell: "desktop",
    },
    steps: [
      { text: "Choose Offline in Connection.", highlight: "demo:connection" },
      { text: "Type three lines.", highlight: "page" },
      { text: "Choose Online.", highlight: "demo:connection" },
    ],
    check:
      'The status reads "Saved · Offline, 3 waiting", then "Saved · Synced".',
    evidence: ["Saved · Offline, 3 waiting", "Saved · Synced"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "desktop-first-script",
    group: "Desktop",
    promise:
      "A script you start on this device is yours until you sign in to sync.",
    setup: {
      userId: "you",
      open: "/",
      extraWindows: [],
      prepare: "you-first-run",
      shell: "desktop",
    },
    steps: [
      { text: "Type a scene heading.", highlight: "page" },
      {
        text: "Open the Sync centre and choose Sign in to sync.",
        highlight: "app.signInToSync",
      },
    ],
    check:
      'The status reads "Saved · On this device only", then "Saved · Synced".',
    evidence: ["Saved · On this device only", "Saved · Synced"],
    fresh: true,
    waitsFor: null,
    hidden: "its end-to-end test does not pass yet",
  },
  {
    id: "desktop-open-in-browser",
    group: "Desktop",
    promise: "A second person joins from the browser.",
    setup: {
      userId: "sam",
      open: SLACK_WATER,
      extraWindows: [],
      prepare: null,
      shell: "desktop",
    },
    steps: [
      {
        text: "Choose File → Open in browser, and choose Dana there.",
        highlight: "app.openInBrowser",
      },
      { text: "Type in either window.", highlight: "page" },
    ],
    check: 'Both windows read "Saved · Synced" and show each other\'s typing.',
    evidence: ["Saved · Synced"],
    fresh: false,
    waitsFor: null,
    hidden: "its end-to-end test does not pass yet",
  },
  {
    id: "desktop-files",
    group: "Desktop",
    promise: "Open and drop Fountain, FDX, PDF and Ink files.",
    setup: {
      userId: "sam",
      open: "/",
      extraWindows: [],
      prepare: null,
      shell: "desktop",
    },
    steps: [
      {
        text: "Choose Open… in File and pick pigeon-post.fountain.",
        highlight: "file.open",
      },
      {
        text: "Drop low-tide-blue.fdx on the window.",
        highlight: "page",
      },
    ],
    check:
      "Pigeon Post opens with its notes, sections and synopses, and the FDX keeps its locked pages and Blue marks.",
    evidence: ["Pigeon Post"],
    fresh: false,
    waitsFor: "imports",
    hidden: null,
  },
  {
    id: "desktop-prompter-files",
    group: "Desktop",
    promise: "Write the prompter's files to a folder.",
    setup: {
      userId: "ana",
      open: docPath("medium/lannick-one-news/stories/01"),
      extraWindows: [],
      prepare: null,
      shell: "desktop",
    },
    steps: [
      { text: "Choose a folder for the prompter's files.", highlight: "page" },
      { text: "Send the newscast to the prompter.", highlight: "page" },
    ],
    check:
      "The run-order and each story's file are written to the folder you chose.",
    evidence: ["run-order"],
    fresh: false,
    waitsFor: "prompter_files",
    hidden: null,
  },
];
