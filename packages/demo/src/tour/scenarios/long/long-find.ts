import type { TourScenario } from "../../format.ts";
import { LONG_BOOK } from "../documents.ts";

export const LONG_FIND: TourScenario = {
  id: "long-find",
  group: "Long documents",
  promise: "Find a phrase across 2,000 pages.",
  setup: {
    userId: "dana",
    open: LONG_BOOK,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Choose Find and type the Founding.", highlight: "edit.find" },
    {
      text: "Choose Next match to move through the book.",
      highlight: "page",
    },
  ],
  check:
    'The Find bar\'s count reads "1 of" the number of matches, and Next match moves the page to each in turn.',
  evidence: ["1 of"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
