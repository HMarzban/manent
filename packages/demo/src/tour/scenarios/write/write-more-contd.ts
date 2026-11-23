import type { TourScenario } from "../../format.ts";
import { EKBO } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_MORE_CONTD: TourScenario = {
  id: "write-more-contd",
  group: "Write",
  promise: "Pages break as you type, exactly where they will print.",
  setup: setupOf({ userId: "sam", open: EKBO }),
  steps: [
    {
      text: "Scroll until a speech runs over the foot of a page.",
      highlight: "page",
    },
    {
      text: "Type into that speech and watch the break move.",
      highlight: "page",
    },
  ],
  check:
    'The speech ends its page with "(MORE)" and goes on under "(CONT\'D)".',
  evidence: ["(MORE)", "(CONT'D)"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
