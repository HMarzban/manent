import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_PRIVATE: TourScenario = {
  id: "together-private",
  group: "Work together",
  promise: "Write privately, then hand in.",
  setup: setupOf({ userId: "sam", open: SLACK_WATER }),
  steps: [
    { text: "Write privately in a scene.", highlight: "page" },
    { text: "Hand in from the state bar.", highlight: "state_bar" },
  ],
  check:
    'The state bar reads "Writing privately — only you can see this", and handing in shows the changes by scene.',
  evidence: ["Writing privately — only you can see this"],
  fresh: false,
  waitsFor: "private_writing",
  hidden: null,
};
