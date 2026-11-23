import type { TourScenario } from "../../format.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_NEXT_WEEK: TourScenario = {
  id: "rundown-next-week",
  group: "Rundown and prompter",
  promise: "Plan next week's newscasts, one rundown per date.",
  setup: setupOf({ userId: "ana", open: "/" }),
  steps: [
    {
      text: "Open the rundown of Lannick One News a week from today: 9 rows are started.",
      highlight: "page",
    },
    { text: "Make a new rundown for another date.", highlight: "page" },
  ],
  check:
    '"New rundown" makes one for the date chosen, and its rows are dated next week.',
  evidence: ["New rundown"],
  fresh: false,
  waitsFor: "rundowns",
  hidden: null,
};
