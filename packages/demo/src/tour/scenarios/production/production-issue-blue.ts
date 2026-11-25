import type { TourScenario } from "../../format.ts";
import { SALT } from "../documents.ts";

export const PRODUCTION_ISSUE_BLUE: TourScenario = {
  id: "production-issue-blue",
  group: "Production",
  promise: "Issue the Blue pages: the checks first, then one button.",
  setup: {
    userId: "priya",
    open: SALT,
    extraWindows: [],
    prepare: "salt-blue-ready",
    shell: "any",
  },
  steps: [
    {
      text: "Choose Issue Blue… in the state bar.",
      highlight: "production.issue",
    },
    {
      text: "Read the checks: page 12 now runs into 12A.",
      highlight: "send:checks",
    },
    { text: "Choose Issue Blue.", highlight: "send:confirm" },
  ],
  check:
    'The checks say page 12 "creates 12A"; afterwards the headers read "Blue Rev." and new changes are Pink.',
  evidence: ["creates 12A", "Blue Rev."],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
