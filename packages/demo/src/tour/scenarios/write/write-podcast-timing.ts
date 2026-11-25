import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_PODCAST_TIMING: TourScenario = {
  id: "write-podcast-timing",
  group: "Write",
  promise: "See a podcast's running time as you write it.",
  setup: setupOf({ userId: "sam", open: docPath("small/handed-in/ep4") }),
  steps: [
    {
      text: "The status bar shows the episode's running time beside the page count.",
      highlight: "readout:timing",
    },
    {
      text: "Select a passage of Doreen's dialogue: Details shows its time.",
      highlight: "tab:details",
    },
    {
      text: "On a new Cue line, type [THEME T=2:7]: it is underlined and listed in Checks.",
      highlight: "page",
    },
    {
      text: "Select the passage again and choose Exclude from timing: the running time drops.",
      highlight: "timing.exclude",
    },
  ],
  check:
    'The readout reads "14:10"; Details shows "Time" for the selection; the Cue\'s form is underlined, and Checks lists ""T=2:7" sets no time — write minutes and two-digit seconds, as T=2:07".',
  evidence: [
    "14:10",
    "Time",
    '"T=2:7" sets no time — write minutes and two-digit seconds, as T=2:07',
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
