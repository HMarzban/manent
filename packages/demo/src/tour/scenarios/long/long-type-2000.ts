import type { TourScenario } from "../../format.ts";
import { LONG_BOOK } from "../documents.ts";

export const LONG_TYPE_2000: TourScenario = {
  id: "long-type-2000",
  group: "Long documents",
  promise: "Type in a 2,000-page book as easily as in a short one.",
  setup: {
    userId: "dana",
    open: LONG_BOOK,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "Drag the scroll bar to about page 1,400.",
      highlight: "status:page",
    },
    { text: "Type a sentence.", highlight: "page" },
    { text: "Open Timings.", highlight: "demo:timings" },
  ],
  check:
    'Timings shows "Keystroke to frame" for this window while you type deep in the book.',
  evidence: ["Keystroke to frame"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
