import type { TourScenario } from "../../format.ts";
import { TWELVE_ON_FOOT } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_GAME_SCRIPT: TourScenario = {
  id: "write-game-script",
  group: "Write",
  promise:
    "Write a game script: emotes, camera and engine lines beside the dialogue.",
  setup: setupOf({ userId: "sam", open: TWELVE_ON_FOOT }),
  steps: [
    {
      text: "Put the caret on the line PIKE: FLAT · CAL: STUNG.",
      highlight: "page",
    },
    {
      text: "The Element readout names what each line is.",
      highlight: "readout:element",
    },
  ],
  check:
    'Element reads "Emote" there, and "Camera" and "Engine Direction" on those lines.',
  evidence: ["Emote", "Camera", "Engine Direction"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
