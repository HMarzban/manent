import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_NAMES: TourScenario = {
  id: "write-names",
  group: "Write",
  promise: "Names you use are checked as you type.",
  setup: setupOf(
    {
      userId: "sam",
      open: docPath("medium/harbour-lights/205"),
    },
    [],
    "write-names-ready",
  ),
  steps: [
    {
      text: 'Go to scene 4: "Marguerita" has a dotted underline.',
      highlight: "page",
    },
    {
      text: "Put the caret in it: the project's spelling is offered.",
      highlight: "page",
    },
    {
      text: "Press Enter to use it.",
      highlight: "page",
    },
  ],
  check:
    'The offer reads "Marguerite" with "In the project\'s names", and Enter writes it in place of "Marguerita".',
  evidence: ["In the project's names", "Marguerite"],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
