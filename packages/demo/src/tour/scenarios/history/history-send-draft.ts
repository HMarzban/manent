import type { TourScenario } from "../../format.ts";
import { FERRY } from "../documents.ts";

export const HISTORY_SEND_DRAFT: TourScenario = {
  id: "history-send-draft",
  group: "History",
  promise: "Send a draft with asterisks against the last one.",
  setup: {
    userId: "dana",
    open: FERRY,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: 'Send this draft to Network, with asterisks against "Studio draft".',
      highlight: "page",
    },
    {
      text: "Open History: the draft's row says it was sent and opened.",
      highlight: "history_list",
    },
  ],
  check:
    'The PDF carries asterisks against "Studio draft", and the draft\'s row in History says it was sent and opened.',
  evidence: ["Studio draft"],
  fresh: false,
  waitsFor: "send_draft",
  hidden: null,
};
