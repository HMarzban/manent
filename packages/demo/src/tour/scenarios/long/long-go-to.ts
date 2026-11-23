import type { TourScenario } from "../../format.ts";
import { LONG_BOOK } from "../documents.ts";

export const LONG_GO_TO: TourScenario = {
  id: "long-go-to",
  group: "Long documents",
  promise: "Go straight to page 1,873.",
  setup: {
    userId: "dana",
    open: LONG_BOOK,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Go to page 1,873.", highlight: "status:page" },
    { text: "The readout says where you are.", highlight: "status:page" },
  ],
  check: 'The readout reads "Page 1,873".',
  evidence: ["Page 1,873"],
  fresh: false,
  waitsFor: "go_to_page",
  hidden: null,
};
