import type { TourScenario } from "../../format.ts";
import { FERRY } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_FOLLOW: TourScenario = {
  id: "together-follow",
  group: "Work together",
  promise: "Follow another writer through the script.",
  setup: setupOf({ userId: "dana", open: FERRY }, [
    { userId: "sam", open: FERRY },
  ]),
  steps: [
    {
      text: "In Sam's window, choose Dana's name tab to follow her.",
      highlight: "page",
    },
    {
      text: "In Dana's window, move to another scene.",
      highlight: "page",
    },
  ],
  check:
    'Sam\'s state bar reads "Following Dana · Stop", and his page moves with hers.',
  evidence: ["Following Dana"],
  fresh: false,
  waitsFor: "follow",
  hidden: null,
};
