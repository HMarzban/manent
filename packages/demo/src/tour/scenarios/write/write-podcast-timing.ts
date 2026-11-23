import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_PODCAST_TIMING: TourScenario = {
  id: "write-podcast-timing",
  group: "Write",
  promise: "See a podcast's running time as you write it.",
  setup: setupOf({ userId: "sam", open: docPath("small/handed-in/ep4") }),
  steps: [
    { text: "Type a line of dialogue.", highlight: "page" },
    { text: "Read the running time as it grows.", highlight: "page" },
  ],
  check: 'The running time reads "14:10" of 20:00, and "Under 5:50".',
  evidence: ["14:10", "Under 5:50"],
  fresh: false,
  waitsFor: "variety_timing",
  hidden: null,
};
