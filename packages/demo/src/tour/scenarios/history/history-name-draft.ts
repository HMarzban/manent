import type { TourScenario } from "../../format.ts";
import { EKBO } from "../documents.ts";

export const HISTORY_NAME_DRAFT: TourScenario = {
  id: "history-name-draft",
  group: "History",
  promise: "Name a draft and it keeps its name in History.",
  setup: {
    userId: "sam",
    open: EKBO,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "Choose Name this draft…, call it Table read draft and press Enter.",
      highlight: "history.nameDraft",
    },
    { text: "Read the list of drafts.", highlight: "history_list" },
  ],
  check:
    'History lists "Table read draft" above "Second draft — Act One (for Nell)" and "First draft".',
  evidence: ["Table read draft"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
