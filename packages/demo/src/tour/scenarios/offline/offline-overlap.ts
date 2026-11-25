import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";

export const OFFLINE_OVERLAP: TourScenario = {
  id: "offline-overlap",
  group: "Go offline",
  promise:
    "When two people change the same line, one of them offline, you choose which wording stays.",
  setup: {
    userId: "dana",
    open: SLACK_WATER,
    extraWindows: [{ userId: "priya", open: SLACK_WATER }],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "In Dana's window choose Offline and rewrite the first line of dialogue in scene 15.",
      highlight: "demo:connection",
    },
    { text: "In Priya's window rewrite the same line.", highlight: "page" },
    {
      text: "In Dana's window choose Online.",
      highlight: "demo:connection",
    },
    {
      text: "Open the Sync centre from the status, choose Review, then Use Priya's.",
      highlight: "app.syncCentre",
    },
  ],
  check:
    'Dana reads "1 change synced · 1 passage overlaps — review" and "Saved · Synced, 1 to review"; Use Priya\'s puts her wording in and says "Used Priya\'s wording in Sc. 15."',
  evidence: [
    "1 change synced · 1 passage overlaps — review",
    "Saved · Synced, 1 to review",
    "Used Priya's wording in Sc. 15.",
  ],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
