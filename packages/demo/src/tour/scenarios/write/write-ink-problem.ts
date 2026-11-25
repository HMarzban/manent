import type { TourScenario } from "../../format.ts";
import { KEEPERS_LOGBOOK } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_INK_PROBLEM: TourScenario = {
  id: "write-ink-problem",
  group: "Write",
  promise:
    "A mistake in an Ink story is marked on its line, and the story keeps playing.",
  setup: setupOf({ userId: "sam", open: KEEPERS_LOGBOOK }),
  steps: [
    {
      text: "Choose Play in the title menu.",
      highlight: "ink.play",
    },
    {
      text: "On line 56 change -> dark to -> cottage.",
      highlight: "page",
    },
    {
      text: "Choose 1 problem in the player: the caret moves to line 56.",
      highlight: "ink:problems",
    },
    {
      text: "Choose Undo.",
      highlight: "edit.undo",
    },
  ],
  check:
    'The line is marked and the player reads "1 problem" and "Playing the last version that compiled"; after Undo it reads "Up to date".',
  evidence: [
    "1 problem",
    "Playing the last version that compiled",
    "Up to date",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
