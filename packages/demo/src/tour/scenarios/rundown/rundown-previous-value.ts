import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_PREVIOUS_VALUE: TourScenario = {
  id: "rundown-previous-value",
  group: "Rundown and prompter",
  promise: "Every overwritten cell keeps its earlier value.",
  setup: setupOf({
    userId: "ana",
    open: docPath("medium/the-late-desk/rundowns/day"),
  }),
  steps: [
    {
      text: "Row 8's Dur reads 8:30: Ana changed it from 9:00 earlier today.",
      highlight: "rundown:cell",
    },
    {
      text: "Choose Previous value in row 8's row menu.",
      highlight: "rundown.previousValue",
    },
    {
      text: "Choose Restore: Dur reads 9:00 again, and Cume, Start, Back and Over follow.",
      highlight: "rundown.restorePrevious",
    },
  ],
  check:
    'The popover reads "Previous value — Ana" and the time, and "Was 9:00"; after Restore the message reads "Restored Dur in row 8 to 9:00."',
  evidence: [
    "Previous value — Ana",
    "Was 9:00",
    "Restored Dur in row 8 to 9:00.",
  ],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
