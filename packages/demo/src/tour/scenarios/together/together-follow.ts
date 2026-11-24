import type { TourScenario } from "../../format.ts";
import { FERRY } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_FOLLOW: TourScenario = {
  id: "together-follow",
  group: "Work together",
  promise: "Follow another writer through the script.",
  setup: setupOf({ userId: "sam", open: FERRY }, [
    { userId: "dana", open: FERRY },
  ]),
  steps: [
    {
      text: "Open the people list from Dana's avatar and choose Follow.",
      highlight: "people_list",
    },
    {
      text: "In Dana's window, go to scene 11 and type.",
      highlight: "page",
    },
    {
      text: "In Sam's window, type a letter.",
      highlight: "page",
    },
  ],
  check:
    'Sam\'s state bar reads "Following Dana" while his page keeps up with hers; his typing ends it with "Stopped following Dana."',
  evidence: ["Following Dana", "Stopped following Dana."],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
