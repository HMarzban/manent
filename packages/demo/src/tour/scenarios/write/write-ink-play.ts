import type { TourScenario } from "../../format.ts";
import { KEEPERS_LOGBOOK } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_INK_PLAY: TourScenario = {
  id: "write-ink-play",
  group: "Write",
  promise:
    "Play an Ink story beside its source, and watch it follow your edits.",
  setup: setupOf({ userId: "sam", open: KEEPERS_LOGBOOK }),
  steps: [
    {
      text: "Choose Play in the title menu: the player opens beside the source.",
      highlight: "ink.play",
    },
    {
      text: "Press 1 for Ask about the storm, then 1 for Read the last entry.",
      highlight: "ink:choices",
    },
    {
      text: "On line 24 change Four hours to Five hours.",
      highlight: "page",
    },
  ],
  check:
    'The player reads "quiz · question_2" and "Up to date", and "Variables (2)" shows trust at 1; after the edit it reads "Compiling…", then "Up to date", replays both choices and shows "Five hours".',
  evidence: ["quiz · question_2", "Up to date", "Variables (2)", "Five hours"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
