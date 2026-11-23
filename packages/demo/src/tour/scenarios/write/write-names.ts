import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_NAMES: TourScenario = {
  id: "write-names",
  group: "Write",
  promise: "Names you use are checked as you type.",
  setup: setupOf({
    userId: "sam",
    open: docPath("medium/harbour-lights/205"),
  }),
  steps: [
    {
      text: "Go to scene 4, where the action names Marguerita.",
      highlight: "page",
    },
    {
      text: "Hold the pointer over the dotted underline.",
      highlight: "page",
    },
  ],
  check:
    '"Marguerita" is underlined with dots, and the underline offers "Marguerite".',
  evidence: ["Marguerite"],
  fresh: false,
  waitsFor: "names_and_facts",
  hidden: null,
};
