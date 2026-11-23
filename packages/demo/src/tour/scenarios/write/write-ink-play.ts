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
      text: "Play the story beside its source and choose Ask about the storm.",
      highlight: "page",
    },
    {
      text: "Change Four hours to Five hours on line 24.",
      highlight: "page",
    },
  ],
  check:
    'The state reads "Compiling…", then "Up to date", and the player replays both choices with the new line.',
  evidence: ["Compiling…", "Up to date"],
  fresh: false,
  waitsFor: "ink_player",
  hidden: null,
};
