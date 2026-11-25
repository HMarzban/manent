import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";
import { NOT_PASSING } from "./not-passing.ts";

export const HISTORY_VIEW_VERSION: TourScenario = {
  id: "history-view-version",
  group: "History",
  promise: "Open an old draft exactly as it was, page for page.",
  setup: {
    userId: "dana",
    open: LONG_NIGHT,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: 'Open History and choose "Table read draft".',
      highlight: "history_list",
    },
    {
      text: "Read it, then choose Back to Working.",
      highlight: "history.backToWorking",
    },
  ],
  check:
    'The draft opens read-only as it was paginated, under "Table read draft", with "Back to Working".',
  evidence: ["Table read draft", "Back to Working"],
  fresh: false,
  waitsFor: null,
  hidden: NOT_PASSING,
};
