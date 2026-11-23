import type { TourScenario } from "../../format.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_PRINT: TourScenario = {
  id: "rundown-print",
  group: "Rundown and prompter",
  promise: "Print a rundown, all its scripts as one, and its brackets.",
  setup: setupOf({ userId: "ana", open: "/" }),
  steps: [
    {
      text: "Open today's rundown of Lannick One News: it holds 40 stories.",
      highlight: "page",
    },
    { text: "Print the rundown as a PDF.", highlight: "page" },
    {
      text: "Print all its scripts as one document, then its brackets list.",
      highlight: "page",
    },
  ],
  check:
    'The rundown PDF lists all 40 stories, starting with "Tolle Exchange library: council votes yes"; the scripts print as one document, and the brackets as a list.',
  evidence: ["Tolle Exchange library: council votes yes"],
  fresh: false,
  waitsFor: "rundowns",
  hidden: null,
};
