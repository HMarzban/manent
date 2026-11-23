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
    { text: "Open Find and type the Founding.", highlight: "page" },
    { text: "Step through what it finds.", highlight: "page" },
  ],
  check: 'Find reaches "the Founding" wherever it is in the book.',
  evidence: ["the Founding"],
  fresh: false,
  waitsFor: "find_bar",
  hidden: null,
};
