import type { TourScenario } from "../../format.ts";
import { FERRY } from "../documents.ts";
import { NOT_PASSING } from "./not-passing.ts";

export const HISTORY_CHANGES_SINCE: TourScenario = {
  id: "history-changes-since",
  group: "History",
  promise: "See exactly what changed since the draft you sent.",
  setup: {
    userId: "dana",
    open: FERRY,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: 'Choose Changes since and pick "Studio draft".',
      highlight: "history.changesSince",
    },
    {
      text: "Read scene 8 on page 12: the new words are marked.",
      highlight: "page",
    },
  ],
  check:
    'The marked lines include "The pencil marks stop at Thursday." and "Nobody\'s logged a crossing since the fog came in."',
  evidence: [
    "The pencil marks stop at Thursday.",
    "Nobody's logged a crossing since the fog came in.",
  ],
  fresh: false,
  waitsFor: null,
  hidden: NOT_PASSING,
};
