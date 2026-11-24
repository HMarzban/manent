import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_PRESENT: TourScenario = {
  id: "together-present",
  group: "Work together",
  promise: "Present to the room and take pitches.",
  setup: setupOf(
    { userId: "dana", open: SLACK_WATER },
    [{ userId: "sam", open: SLACK_WATER }],
    "together-present-ready",
  ),
  steps: [
    {
      text: "Choose Present to the room in View.",
      highlight: "view.presentToRoom",
    },
    {
      text: "Put your caret in Ida's speech in scene 6.",
      highlight: "page",
    },
    {
      text: "In Sam's window, choose Pitch in the state bar, type a line and press Enter.",
      highlight: "state_bar",
    },
    {
      text: "Open the alternates on Ida's speech.",
      highlight: "alternates",
    },
  ],
  check:
    'Sam\'s state bar reads "Dana is driving"; Dana\'s marker reads "1/4", and her alternates list Sam\'s line marked "Pitched", with Use this.',
  evidence: ["Dana is driving", "1/4", "Pitched"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
