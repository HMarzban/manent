import type { TourScenario } from "../../format.ts";
import { TWELVE_ON_FOOT } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_GAME_LINES: TourScenario = {
  id: "write-game-lines",
  group: "Write",
  promise:
    "A game script's branching lines, coloured and exported with their IDs.",
  setup: setupOf({ userId: "sam", open: TWELVE_ON_FOOT }),
  steps: [
    {
      text: "Go to scene 4: its choices are coloured and nested.",
      highlight: "page",
    },
    { text: "Export the script's line data.", highlight: "page" },
  ],
  check:
    'The choices are coloured and nested by their markers, and the line data gives each line its "kind" and "depth".',
  evidence: ["kind", "depth"],
  fresh: false,
  waitsFor: "game_lines",
  hidden: null,
};
