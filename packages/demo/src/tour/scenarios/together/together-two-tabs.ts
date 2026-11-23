import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_TWO_TABS: TourScenario = {
  id: "together-two-tabs",
  group: "Work together",
  promise: "Open one script in two tabs: both stay saved and synced.",
  setup: setupOf({ userId: "dana", open: SLACK_WATER }, [
    { userId: "dana", open: SLACK_WATER },
  ]),
  steps: [
    { text: "Type a line in each window.", highlight: "page" },
    { text: "Close the first window.", highlight: "status:server" },
  ],
  check: 'The window left open still reads "Saved · Synced".',
  evidence: ["Saved · Synced"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
