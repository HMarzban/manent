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
    { text: "Choose Go to and type 1873.", highlight: "app.goTo" },
    { text: "Press Enter.", highlight: "status:page" },
  ],
  check: 'The page readout reads "Page 1873 of 2,000".',
  evidence: ["Page 1873 of 2,000"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
