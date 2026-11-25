import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";
import { NOT_PASSING } from "./not-passing.ts";

export const HISTORY_EVERY_VERSION: TourScenario = {
  id: "history-every-version",
  group: "History",
  promise: "Every version is kept, with who made it and when.",
  setup: {
    userId: "dana",
    open: LONG_NIGHT,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Open History.", highlight: "history.open" },
    {
      text: "Scroll the list: every session, and every draft by its name.",
      highlight: "history_list",
    },
  ],
  check:
    'History lists the sessions and the drafts "White production draft", "Shooting draft", "Table read draft" and "First draft".',
  evidence: [
    "White production draft",
    "Shooting draft",
    "Table read draft",
    "First draft",
  ],
  fresh: false,
  waitsFor: null,
  hidden: NOT_PASSING,
};
