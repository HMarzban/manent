import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_RULER: TourScenario = {
  id: "write-ruler",
  group: "Write",
  promise: "Set a speech's indent on the ruler, and the page follows.",
  setup: setupOf({
    userId: "sam",
    open: docPath("medium/harbour-lights/205"),
  }),
  steps: [
    { text: "Choose Ruler in View.", highlight: "view.ruler" },
    {
      text: "Put the caret in a line of dialogue and drag the ruler's left marker.",
      highlight: "ruler",
    },
    {
      text: "Open Details: Layout shows the indent you set.",
      highlight: "tab:details",
    },
  ],
  check:
    "The speech moves with the marker, and Details reads its new value under Layout, Indent.",
  evidence: ["Layout", "Indent"],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
