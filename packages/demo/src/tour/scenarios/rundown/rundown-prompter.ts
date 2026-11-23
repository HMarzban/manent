import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_PROMPTER: TourScenario = {
  id: "rundown-prompter",
  group: "Rundown and prompter",
  promise:
    "Send a script to the prompter, with its text size, dark and mirror.",
  setup: setupOf({
    userId: "ana",
    open: docPath("medium/the-late-desk/monologue"),
  }),
  steps: [
    { text: "Choose Present on prompter.", highlight: "page" },
    {
      text: "Set the text size, then turn on dark and mirror.",
      highlight: "page",
    },
  ],
  check:
    'The prompter shows the Monologue at that size, dark and mirrored, and reads "Live".',
  evidence: ["Live"],
  fresh: false,
  waitsFor: "prompter",
  hidden: null,
};
