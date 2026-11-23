import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";

export const OFFLINE_SLOW: TourScenario = {
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
  check: 'The status reads "Saved · Syncing…" at once, then "Saved · Synced".',
  evidence: ["Saved · Syncing…", "Saved · Synced"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
