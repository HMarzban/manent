import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_SUGGEST: TourScenario = {
  id: "together-suggest",
  group: "Work together",
  promise: "Suggest a change for someone else to accept.",
  setup: setupOf({ userId: "sam", open: SLACK_WATER }, [
    { userId: "dana", open: SLACK_WATER },
  ]),
  steps: [
    {
      text: "In Sam's window, write as suggestions in scene 9.",
      highlight: "page",
    },
    {
      text: "In Dana's window, accept the suggestion.",
      highlight: "page",
    },
  ],
  check:
    "Sam's state bar reads \"Writing as suggestions — others accept or decline\", and Dana's acceptance puts his words in.",
  evidence: ["Writing as suggestions — others accept or decline"],
  fresh: false,
  waitsFor: "suggesting",
  hidden: null,
};
