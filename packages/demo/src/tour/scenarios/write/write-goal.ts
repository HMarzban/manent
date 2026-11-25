import type { TourScenario } from "../../format.ts";
import { EKBO } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_GOAL: TourScenario = {
  id: "write-goal",
  group: "Write",
  promise: "Set a daily goal for a script and run a writing sprint.",
  setup: setupOf({ userId: "sam", open: EKBO }),
  steps: [
    {
      text: "Choose Goal in the Script menu.",
      highlight: "script.goal",
    },
    {
      text: "Set Each day to 2 pages: the readout appears beside the page count.",
      highlight: "status:goal",
    },
    {
      text: "Choose Start sprint and pick 10 minutes.",
      highlight: "sprint.start",
    },
    {
      text: "Choose End in the state bar.",
      highlight: "sprint.end",
    },
  ],
  check:
    'Goal reads "Yours, on this script", the status bar reads "0 of 2 pages", the state bar counts the sprint down, and End says "Ended the sprint".',
  evidence: ["Yours, on this script", "0 of 2 pages", "Ended the sprint"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
