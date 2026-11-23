import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_PRESENT: TourScenario = {
  id: "together-present",
  group: "Work together",
  promise: "Present to the room and take pitches.",
  setup: setupOf({ userId: "dana", open: SLACK_WATER }, [
    { userId: "sam", open: SLACK_WATER },
  ]),
  steps: [
    {
      text: "In Dana's window, present to the room from scene 6.",
      highlight: "page",
    },
    {
      text: "In Sam's window, pitch a line for the speech.",
      highlight: "state_bar",
    },
  ],
  check:
    "Sam's state bar reads \"Dana is driving · Pitch · Take keys\", and his pitch lands in the speech's alternates.",
  evidence: ["Dana is driving · Pitch · Take keys"],
  fresh: false,
  waitsFor: "present",
  hidden: null,
};
