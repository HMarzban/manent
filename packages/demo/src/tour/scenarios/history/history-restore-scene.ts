import type { TourScenario } from "../../format.ts";
import { EKBO } from "../documents.ts";
import { NOT_PASSING } from "./not-passing.ts";

export const HISTORY_RESTORE_SCENE: TourScenario = {
  id: "history-restore-scene",
  group: "History",
  promise:
    "Bring one scene back from an earlier draft; the rest stays as it is.",
  setup: {
    userId: "sam",
    open: EKBO,
    extraWindows: [],
    prepare: "ekbo-scene-14-second-draft",
    shell: "any",
  },
  steps: [
    {
      text: 'Open History and choose "First draft".',
      highlight: "history.open",
    },
    {
      text: "Put the caret in scene 14, choose Restore this scene, then Restore scene 14.",
      highlight: "history.restoreScene",
    },
  ],
  check:
    'Scene 14 reads as it did: "No. Play me a C. The top one." History gains "Before restore".',
  evidence: ["No. Play me a C. The top one.", "Before restore"],
  fresh: false,
  waitsFor: null,
  hidden: NOT_PASSING,
};
