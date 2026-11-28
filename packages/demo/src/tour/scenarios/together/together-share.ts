import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_SHARE: TourScenario = {
  id: "together-share",
  group: "Work together",
  promise: "Change what someone may do, and their window follows at once.",
  setup: setupOf(
    { userId: "dana", open: SLACK_WATER },
    [{ userId: "leo", open: SLACK_WATER }],
    "together-share-ready",
  ),
  steps: [
    {
      text: "Choose Share.",
      highlight: "share",
    },
    {
      text: "Change Leo Marsh from Can view to Can comment.",
      highlight: "share",
    },
    {
      text: "Under Link, turn on Anyone with the link.",
      highlight: "share",
    },
    {
      text: "In Leo's window, read the state bar.",
      highlight: "state_bar",
    },
  ],
  check:
    'Leo\'s window reads "View only — you can comment" without a reload, and Share\'s summary ends "and anyone with the link can open this script".',
  evidence: [
    "View only — you can comment",
    "anyone with the link can open this script",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
