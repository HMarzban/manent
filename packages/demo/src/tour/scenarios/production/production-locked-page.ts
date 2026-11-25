import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";

export const PRODUCTION_LOCKED_PAGE: TourScenario = {
  id: "production-locked-page",
  group: "Production",
  promise:
    "Edit a locked page: extra text goes to an A-page and no page number moves.",
  setup: {
    userId: "priya",
    open: LONG_NIGHT,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "On page 18, type at the end of Mrs. Adeyemi's speech.",
      highlight: "page",
    },
    {
      text: "Hold the pointer over the lock beside the page.",
      highlight: "page_lock",
    },
  ],
  check:
    'The lock reads "Page numbers are locked. You can still edit; extra text goes to 18A." and page 64A is already there.',
  evidence: [
    "Page numbers are locked. You can still edit; extra text goes to 18A.",
    "64A",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
