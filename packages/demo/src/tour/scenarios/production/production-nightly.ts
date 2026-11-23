import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";

export const PRODUCTION_NIGHTLY: TourScenario = {
  id: "production-nightly",
  group: "Production",
  promise: "Send a nightly draft marked against the last one.",
  setup: {
    userId: "dana",
    open: docPath("heavy/h25/305"),
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Choose Send draft… in the title menu.", highlight: "page" },
    {
      text: 'Mark it against "Network run-through draft".',
      highlight: "page",
    },
  ],
  check:
    'The draft goes out with asterisks against "Network run-through draft".',
  evidence: ["Network run-through draft"],
  fresh: false,
  waitsFor: "send_draft",
  hidden: null,
};
