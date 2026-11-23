import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";

export const PRODUCTION_OMIT: TourScenario = {
  id: "production-omit",
  group: "Production",
  promise: "Omit a scene and keep its number.",
  setup: {
    userId: "priya",
    open: LONG_NIGHT,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "Go to scene 25: it is omitted and keeps its number.",
      highlight: "page",
    },
    {
      text: "In View → Revision marks, choose All revisions.",
      highlight: "view.marks.all",
    },
  ],
  check:
    'Scene 25 prints as "OMITTED" with its number, and the state bar reads "Showing all revisions".',
  evidence: ["OMITTED", "Showing all revisions"],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
