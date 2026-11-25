import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_ADD_WRITERS: TourScenario = {
  id: "together-add-writers",
  group: "Work together",
  promise: "Twenty people can type at once and your own typing stays quick.",
  setup: setupOf({ userId: "sam", open: SLACK_WATER }),
  steps: [
    {
      text: "Put the caret in scene 2, then choose 5 in Add writers.",
      highlight: "demo:writers",
    },
    {
      text: "Type in your own scene while they write theirs.",
      highlight: "page",
    },
    { text: "Open Timings.", highlight: "demo:timings" },
    {
      text: "Choose Stop writers in Add writers.",
      highlight: "demo:writers",
    },
  ],
  check:
    'The control reads "5 writers typing" while five named writers type in scenes of their own; Timings shows "Keystroke to frame" with its percentiles.',
  evidence: ["5 writers typing", "Keystroke to frame"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
