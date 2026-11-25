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
    { text: "Choose Send draft… in the title menu.", highlight: "draft.send" },
    {
      text: "What has Full draft chosen, marked against the last draft sent.",
      highlight: "send:what",
    },
  ],
  check:
    'What reads "Full draft", with "Marked with asterisks against \'Network run-through draft\', the last draft sent."',
  evidence: ["Full draft", "Network run-through draft"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
