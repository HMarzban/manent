import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";

export const OFFLINE_REORGANISED: TourScenario = {
  id: "offline-reorganised",
  group: "Go offline",
  promise:
    "Come back to a script that was reorganised while you were away, and your changes are in it.",
  setup: {
    userId: "dana",
    open: SLACK_WATER,
    extraWindows: [{ userId: "priya", open: SLACK_WATER }],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "In Dana's window choose Offline and type in two scenes.",
      highlight: "demo:connection",
    },
    {
      text: "In Priya's window choose Reorganise.",
      highlight: "demo:reorganise",
    },
    {
      text: "In Dana's window choose Online.",
      highlight: "demo:connection",
    },
  ],
  check:
    'Dana reads "Manent reorganised how this script is stored while you were away.", then how many of her changes were re-applied, and the status returns to "Saved · Synced".',
  evidence: [
    "Manent reorganised how this script is stored while you were away.",
    "Saved · Synced",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
