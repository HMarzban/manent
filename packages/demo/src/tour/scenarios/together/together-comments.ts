import type { TourScenario } from "../../format.ts";
import { FERRY } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_COMMENTS: TourScenario = {
  id: "together-comments",
  group: "Work together",
  promise: "Reply to a note and resolve it; everyone sees it close.",
  setup: setupOf({ userId: "leo", open: FERRY }, [
    { userId: "sam", open: FERRY },
  ]),
  steps: [
    { text: "Reply to the first comment thread.", highlight: "page" },
    { text: "Resolve the thread.", highlight: "page" },
  ],
  check:
    "The thread reads \"Resolved\" in Leo's window, and Sam's window shows it close at once.",
  evidence: ["Resolved"],
  fresh: false,
  waitsFor: "comments",
  hidden: null,
};
