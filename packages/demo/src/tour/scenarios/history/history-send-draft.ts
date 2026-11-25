import type { TourScenario } from "../../format.ts";
import { FERRY } from "../documents.ts";
import { NOT_PASSING } from "./not-passing.ts";

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
      text: "Choose Send draft… in the title menu: Name reads Network.",
      highlight: "draft.send",
    },
    {
      text: "Under As choose PDF with asterisks against Studio draft, and under To choose Network.",
      highlight: "send:to",
    },
    {
      text: "Choose Send to 4 people.",
      highlight: "send:confirm",
    },
    {
      text: "Open History: the draft's row says who it went to.",
      highlight: "history_list",
    },
  ],
  check:
    'The message reads "Sent \'Network\' to 4 people.", and History\'s row reads "Sent to Network (4) · opened by 0 of 4".',
  evidence: [
    "Sent 'Network' to 4 people.",
    "Sent to Network (4) · opened by 0 of 4",
  ],
  fresh: true,
  waitsFor: null,
  hidden: NOT_PASSING,
};
