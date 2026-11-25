import type { TourScenario } from "../../format.ts";
import { SALT } from "../documents.ts";

export const PRODUCTION_RECALL: TourScenario = {
  id: "production-recall",
  group: "Production",
  promise: "Correct a mistake in pages you issued, within a day.",
  setup: {
    userId: "priya",
    open: SALT,
    extraWindows: [],
    prepare: "salt-blue-issued",
    shell: "any",
  },
  steps: [
    {
      text: 'On page 31 change "fourteen" back to "forty".',
      highlight: "page",
    },
    {
      text: "Choose Recall Blue… in the state bar.",
      highlight: "production.recall",
    },
    {
      text: "Choose page 31, then Recall Blue.",
      highlight: "send:confirm",
    },
  ],
  check:
    'The Send screen reads "Recall Blue", and the corrected page goes out as "Blue (corrected)".',
  evidence: ["Recall Blue", "Blue (corrected)"],
  fresh: true,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
