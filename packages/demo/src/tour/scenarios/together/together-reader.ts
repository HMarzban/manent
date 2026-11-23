import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_READER: TourScenario = {
  id: "together-reader",
  group: "Work together",
  promise: "A reader sees what changed since they last read.",
  setup: setupOf({ userId: "leo", open: LONG_NIGHT }),
  steps: [
    { text: "Open the draft Leo was sent.", highlight: "page" },
    {
      text: "Choose Changes since you last read in the state bar.",
      highlight: "state_bar",
    },
  ],
  check:
    'The state bar holds "Changes since you last read", which lists the Blue pages.',
  evidence: ["Changes since you last read"],
  fresh: false,
  waitsFor: "reader_drafts",
  hidden: null,
};
