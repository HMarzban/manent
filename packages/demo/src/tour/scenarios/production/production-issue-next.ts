import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";

export const PRODUCTION_ISSUE_NEXT: TourScenario = {
  id: "production-issue-next",
  group: "Production",
  promise: "Issue the next colour when its pages are ready.",
  setup: {
    userId: "priya",
    open: LONG_NIGHT,
    extraWindows: [],
    prepare: "long-night-pink-ready",
    shell: "any",
  },
  steps: [
    {
      text: "Choose Issue Pink… in the state bar.",
      highlight: "production.issue",
    },
    {
      text: "Read the checks, then choose Issue Pink.",
      highlight: "send:confirm",
    },
  ],
  check:
    'The checks list 64A, and the screen says "Issuing Pink starts Yellow: edits made after this are Yellow."',
  evidence: [
    "64A",
    "Issuing Pink starts Yellow: edits made after this are Yellow.",
  ],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
