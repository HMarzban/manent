import type { TourScenario } from "../../format.ts";
import { EKBO } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_TRUE_PAGES: TourScenario = {
  id: "write-true-pages",
  group: "Write",
  promise: "Write in true pages: what you see is what prints.",
  setup: setupOf({ userId: "sam", open: EKBO }),
  steps: [
    {
      text: "At the end of a speech press Enter, then type M: the names in this script are offered.",
      highlight: "page",
    },
    {
      text: "Press Tab for a line of dialogue, and Enter for the next element.",
      highlight: "page",
    },
    {
      text: "The readout says which page you are on, of how many.",
      highlight: "status:page",
    },
  ],
  check: 'Autocomplete offers MIRA; the readout reads "Page 1 of 99".',
  evidence: ["MIRA", "Page 1 of 99"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
