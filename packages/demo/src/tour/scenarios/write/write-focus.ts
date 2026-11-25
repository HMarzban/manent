import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_FOCUS: TourScenario = {
  id: "write-focus",
  group: "Write",
  promise: "Hide every panel and write, with your status still in view.",
  setup: setupOf({ userId: "sam", open: SLACK_WATER }),
  steps: [
    {
      text: "Choose Focus mode in View: both panels close.",
      highlight: "view.focusMode",
    },
    {
      text: "The status beside the title still says where your words are.",
      highlight: "status:server",
    },
    {
      text: "Choose Focus mode again: the panels come back as they were.",
      highlight: "view.focusMode",
    },
  ],
  check:
    'With both panels closed the status still reads "Saved · Synced"; choosing Focus mode again brings back the Scenes tab.',
  evidence: ["Saved · Synced", "Scenes"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
