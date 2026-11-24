import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_READER: TourScenario = {
  id: "together-reader",
  group: "Work together",
  promise: "A reader sees what changed since they last read.",
  setup: setupOf({ userId: "leo", open: LONG_NIGHT }),
  steps: [
    {
      text: "This is the draft as Leo was sent it: true pages, and none of the writing tools.",
      highlight: "page",
    },
    {
      text: "Choose Changes since you last read in the state bar.",
      highlight: "history.sinceLastRead",
    },
    {
      text: "Go to page 17: the changes are marked.",
      highlight: "page",
    },
  ],
  check:
    'The state bar reads "Blue" with "Changes since you last read", and choosing it reads "16 pages changed since you last read".',
  evidence: [
    "Changes since you last read",
    "16 pages changed since you last read",
    "Blue",
  ],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
