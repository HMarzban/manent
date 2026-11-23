import type { TourScenario } from "../../format.ts";
import { FERRY } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_CURSORS: TourScenario = {
  id: "together-cursors",
  group: "Work together",
  promise: "Write together and see where everyone is.",
  setup: setupOf({ userId: "dana", open: FERRY }, [
    { userId: "sam", open: FERRY },
  ]),
  steps: [
    {
      text: "In Sam's window, click into Ida's speech in scene 10.",
      highlight: "page",
    },
    {
      text: "In Dana's window, Sam's caret appears in the same place.",
      highlight: "page",
    },
  ],
  check:
    "In Dana's page Sam's caret carries a tab with his first name while he moves, then his initials, \"SO\".",
  evidence: ["SO"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
