import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_SUGGEST: TourScenario = {
  id: "together-suggest",
  group: "Work together",
  promise: "Suggest a change for someone else to accept.",
  setup: setupOf(
    { userId: "sam", open: SLACK_WATER },
    [{ userId: "dana", open: SLACK_WATER }],
    "together-suggest-ready",
  ),
  steps: [
    {
      text: "Open the people list and choose Writing: As suggestions.",
      highlight: "writing_switch",
    },
    {
      text: "In scene 9, change a word in a line of dialogue.",
      highlight: "page",
    },
    {
      text: "In Dana's window, open History and choose Use this on Sam's suggestion.",
      highlight: "to_review",
    },
  ],
  check:
    'Sam\'s state bar reads "Writing as suggestions — others accept or decline"; Dana\'s To review lists "Sc. 9 · Sam suggested this", and Use this says "Used Sam\'s suggestion in Sc. 9."',
  evidence: [
    "Writing as suggestions — others accept or decline",
    "Sc. 9 · Sam suggested this",
    "Used Sam's suggestion in Sc. 9.",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
