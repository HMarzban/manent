import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";
import { NOT_PASSING } from "./not-passing.ts";

export const HISTORY_WHO_WROTE: TourScenario = {
  id: "history-who-wrote",
  group: "History",
  promise: "Ask who wrote any line.",
  setup: {
    userId: "priya",
    open: LONG_NIGHT,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Put the caret in scene 26A.", highlight: "page" },
    { text: "Choose Who wrote this?", highlight: "history.whoWrote" },
  ],
  check: 'Details reads "Written by Sam" and when.',
  evidence: ["Written by Sam"],
  fresh: false,
  waitsFor: null,
  hidden: NOT_PASSING,
};
