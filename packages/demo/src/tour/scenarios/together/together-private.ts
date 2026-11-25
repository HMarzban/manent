import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_PRIVATE: TourScenario = {
  id: "together-private",
  group: "Work together",
  promise: "Write privately, then hand in.",
  setup: setupOf(
    { userId: "sam", open: SLACK_WATER },
    [],
    "together-private-ready",
  ),
  steps: [
    {
      text: "The state bar says who can see what you type.",
      highlight: "state_bar",
    },
    {
      text: "Choose Hand in… in the state bar: your changes are listed by scene.",
      highlight: "writing.handIn",
    },
    {
      text: "Choose Hand in, then Hand in 6 scenes.",
      highlight: "hand_in:confirm",
    },
  ],
  check:
    'The state bar read "Writing privately — only you can see this"; the dialog\'s button reads "Hand in 6 scenes"; afterwards the message says "1 passage is listed under To review" and History holds "Before hand-in".',
  evidence: [
    "Writing privately — only you can see this",
    "Hand in 6 scenes",
    "1 passage is listed under To review",
    "Before hand-in",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
