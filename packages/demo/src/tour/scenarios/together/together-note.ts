import type { TourScenario } from "../../format.ts";
import { UNDERTOW } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_NOTE: TourScenario = {
  id: "together-note",
  group: "Work together",
  promise: "Address a comment in a round and watch the count go down.",
  setup: setupOf({ userId: "dana", open: UNDERTOW }, [], "together-note-ready"),
  steps: [
    {
      text: "Open the Comments tab and choose the Network filter.",
      highlight: "tab:comments",
    },
    {
      text: "Open item 5 on page 33, choose Resolve, then Addressed.",
      highlight: "comment_popover",
    },
    {
      text: "Choose ‹ Library and open Harbour Lights.",
      highlight: "episode_table",
    },
  ],
  check:
    'The filter reads "Network · Thu 12 Nov"; Resolve says "Resolved Leo\'s comment as addressed.", and 203\'s Stage reads "Network · 3 open".',
  evidence: [
    "Network · ",
    "Resolved Leo's comment as addressed.",
    "Network · 3 open",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
