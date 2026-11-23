import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_ALTERNATES: TourScenario = {
  id: "write-alternates",
  group: "Write",
  promise: "Keep other ways to say a line, and cuts you may want back.",
  setup: setupOf({
    userId: "sam",
    open: docPath("medium/the-late-desk/monologue"),
  }),
  steps: [
    {
      text: "Put the caret in a line that has alternates, and swap one in.",
      highlight: "page",
    },
    { text: "Bring a cut back from the left panel.", highlight: "page" },
  ],
  check:
    'An alternate takes the line\'s place, a cut comes back from "Cuts", and the timing changes.',
  evidence: ["Cuts"],
  fresh: false,
  waitsFor: "alternates_and_cuts",
  hidden: null,
};
