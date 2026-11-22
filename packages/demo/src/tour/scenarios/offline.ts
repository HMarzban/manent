// The Tour's Go offline scenarios, in the order the Tour shows them.
import { docPath } from "../../seed/catalogue.ts";
import type { TourScenario } from "../format.ts";

const SLACK_WATER = docPath("medium/harbour-lights/205");

export const OFFLINE: readonly TourScenario[] = [
  {
    id: "offline-write",
    group: "Go offline",
    promise:
      "Keep writing with no connection; everything is there when you come back.",
    setup: {
      userId: "sam",
      open: SLACK_WATER,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Choose Offline in Connection.", highlight: "demo:connection" },
      {
        text: "Type a new line of action, then reload the page: it is still there.",
        highlight: "page",
      },
      { text: "Choose Online.", highlight: "demo:connection" },
      { text: "Open History.", highlight: "tab:history" },
    ],
    check:
      'Offline the status reads "Saved · Offline, 1 waiting"; online it reads "Saved · Synced", and History keeps "Before reconnect — this device".',
    evidence: [
      "Saved · Offline, 1 waiting",
      "Saved · Synced",
      "Before reconnect — this device",
    ],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "offline-overlap",
    group: "Go offline",
    promise:
      "When two people change the same line, one of them offline, you choose which wording stays.",
    setup: {
      userId: "sam",
      open: SLACK_WATER,
      extraWindows: [{ userId: "dana", open: SLACK_WATER }],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: "In Sam's window choose Offline and rewrite the first line of dialogue in scene 2.",
        highlight: "demo:connection",
      },
      { text: "In Dana's window rewrite the same line.", highlight: "page" },
      {
        text: "In Sam's window choose Online.",
        highlight: "demo:connection",
      },
      {
        text: "Open the Sync centre from the status, choose Review, then Use Dana's.",
        highlight: "app.syncCentre",
      },
    ],
    check:
      'Sam reads "1 change synced · 1 passage overlaps — review" and "Saved · Synced, 1 to review"; Use Dana\'s puts her wording in and says "Used Dana\'s wording in Sc. 2."',
    evidence: [
      "1 change synced · 1 passage overlaps — review",
      "Saved · Synced, 1 to review",
      "Used Dana's wording in Sc. 2.",
    ],
    fresh: false,
    waitsFor: null,
    hidden: "its end-to-end test does not pass yet",
  },
  {
    id: "offline-recovered",
    group: "Go offline",
    promise: "Words typed into a scene someone else deleted are kept for you.",
    setup: {
      userId: "sam",
      open: SLACK_WATER,
      extraWindows: [{ userId: "dana", open: SLACK_WATER }],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: "In Sam's window choose Offline and type in scene 9.",
        highlight: "demo:connection",
      },
      { text: "In Dana's window delete scene 9.", highlight: "page" },
      {
        text: "In Sam's window choose Online.",
        highlight: "demo:connection",
      },
    ],
    check: 'The message reads "could not be placed — kept in Recovered text".',
    evidence: ["could not be placed — kept in Recovered text"],
    fresh: false,
    waitsFor: null,
    hidden: "its end-to-end test does not pass yet",
  },
  {
    id: "offline-slow",
    group: "Go offline",
    promise:
      "On a slow connection your words are saved at once and synced when they arrive.",
    setup: {
      userId: "sam",
      open: SLACK_WATER,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Choose Slow in Connection.", highlight: "demo:connection" },
      { text: "Type a line.", highlight: "page" },
      { text: "Choose Online.", highlight: "demo:connection" },
    ],
    check:
      'The status reads "Saved · Syncing…" at once, then "Saved · Synced".',
    evidence: ["Saved · Syncing…", "Saved · Synced"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "offline-server-stopped",
    group: "Go offline",
    promise:
      "Stop the server: you keep writing, and everything is there when it is back.",
    setup: {
      userId: "sam",
      open: SLACK_WATER,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      { text: "Choose Stop the server.", highlight: "demo:server" },
      { text: "Type a line.", highlight: "page" },
      { text: "Choose Start the server.", highlight: "demo:server" },
    ],
    check:
      'While it is stopped the status reads "Saved · Can\'t reach Manent, 1 waiting"; afterwards "Saved · Synced".',
    evidence: ["Can't reach Manent, 1 waiting", "Saved · Synced"],
    fresh: false,
    waitsFor: null,
    hidden: null,
  },
  {
    id: "offline-reorganised",
    group: "Go offline",
    promise:
      "Come back to a script that was reorganised while you were away, and your changes are in it.",
    setup: {
      userId: "sam",
      open: SLACK_WATER,
      extraWindows: [{ userId: "dana", open: SLACK_WATER }],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: "In Sam's window choose Offline and type in two scenes.",
        highlight: "demo:connection",
      },
      {
        text: "In Dana's window choose Reorganise.",
        highlight: "demo:reorganise",
      },
      {
        text: "In Sam's window choose Online.",
        highlight: "demo:connection",
      },
    ],
    check:
      'Sam reads "Manent reorganised how this script is stored while you were away.", then how many of his changes were re-applied, and the status returns to "Saved · Synced".',
    evidence: [
      "Manent reorganised how this script is stored while you were away.",
      "Saved · Synced",
    ],
    fresh: false,
    waitsFor: null,
    hidden: "its end-to-end test does not pass yet",
  },
  {
    id: "offline-sign-out",
    group: "Go offline",
    promise: "Signing out with changes waiting asks first.",
    setup: {
      userId: "sam",
      open: SLACK_WATER,
      extraWindows: [],
      prepare: null,
      shell: "any",
    },
    steps: [
      {
        text: "Choose Offline in Connection and type three lines.",
        highlight: "demo:connection",
      },
      { text: "Switch person to Dana.", highlight: "demo:person" },
    ],
    check:
      'Manent asks "Sign out with 3 changes waiting?", with Export a copy, Cancel and Sign out.',
    evidence: ["Sign out with 3 changes waiting?"],
    fresh: false,
    waitsFor: "sign_out_guard",
    hidden: null,
  },
];
