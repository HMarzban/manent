import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";

export const PRODUCTION_SIDES: TourScenario = {
  id: "production-sides",
  group: "Production",
  promise: "Make sides for the scenes shooting tomorrow.",
  setup: {
    userId: "priya",
    open: LONG_NIGHT,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Choose scenes 24 to 26A.", highlight: "page" },
    { text: "Make sides from them.", highlight: "page" },
  ],
  check: 'The sides keep the locked page labels, "26A" among the scenes.',
  evidence: ["26A"],
  fresh: false,
  waitsFor: "sides",
  hidden: null,
};
