import type { TourScenario } from "../../format.ts";
import { LAMP_ROOM } from "../documents.ts";

export const HISTORY_RESTORE_REVERSE: TourScenario = {
  id: "history-restore-reverse",
  group: "History",
  promise: "Restore a whole draft, and take it back with one action.",
  setup: {
    userId: "sam",
    open: LAMP_ROOM,
    extraWindows: [{ userId: "dana", open: LAMP_ROOM }],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: 'In Sam\'s window open History, choose "First draft", then Restore and confirm Restore.',
      highlight: "history.restore",
    },
    { text: "Dana's window says what happened.", highlight: "message_slot" },
    {
      text: "In Sam's window choose Restore 'Before restore'.",
      highlight: "history.restoreBefore",
    },
  ],
  check:
    "Dana reads \"restored 'First draft' at\" with the time; \"Restore 'Before restore'\" puts everything back.",
  evidence: ["restored 'First draft' at", "Restore 'Before restore'"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
