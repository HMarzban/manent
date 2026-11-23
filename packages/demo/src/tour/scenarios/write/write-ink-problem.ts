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
    { text: "Change -> dark on line 56 to -> cottage.", highlight: "page" },
    { text: "Undo the change.", highlight: "page" },
  ],
  check:
    'The line is marked, the state reads "1 problem", and the player keeps playing, marked "Playing the last version that compiled".',
  evidence: ["1 problem", "Playing the last version that compiled"],
  fresh: false,
  waitsFor: "ink_player",
  hidden: null,
};
