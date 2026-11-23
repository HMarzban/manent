import type { TourScenario } from "../../format.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_PREVIOUS_VALUE: TourScenario = {
  id: "rundown-previous-value",
  group: "Rundown and prompter",
  promise: "Every overwritten cell keeps its earlier value.",
  setup: setupOf({ userId: "ana", open: "/" }),
  steps: [
    { text: "Open today's rundown of The Late Desk.", highlight: "page" },
    {
      text: "Hold the pointer over Dur on row 8: Ana changed 9:00 to 8:30.",
      highlight: "page",
    },
  ],
  check:
    'The cell reads "Previous value — Ana" with the time she changed it, and "Restore".',
  evidence: ["Previous value — Ana", "Restore"],
  fresh: false,
  waitsFor: "rundowns",
  hidden: null,
};
