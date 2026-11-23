import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_SEND: TourScenario = {
  id: "rundown-send",
  group: "Rundown and prompter",
  promise:
    "A story changed after it was sent says so, and one Send puts it right.",
  setup: setupOf({
    userId: "ana",
    open: docPath("medium/lannick-one-news/stories/01"),
  }),
  steps: [
    {
      text: "In today's rundown, the story's row reads Changed — not on prompter.",
      highlight: "page",
    },
    { text: "Choose Send.", highlight: "page" },
  ],
  check:
    'The row reads On prompter, and the prompter shows "thirty-one votes to eight".',
  evidence: ["thirty-one votes to eight"],
  fresh: false,
  waitsFor: "prompter",
  hidden: null,
};
