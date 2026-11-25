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
      text: "Go to scene 4: the choices, the gather, the condition and the tag line are coloured.",
      highlight: "page",
    },
    {
      text: "Choose Export… in the title menu, then Line data (JSON).",
      highlight: "doc.export",
    },
    {
      text: "Choose Export 1 file.",
      highlight: "send:confirm",
    },
    {
      text: "Open The Keeper's Logbook: the Knots tab lists its knots and stitches.",
      highlight: "tab:scenes",
    },
  ],
  check:
    'Export offers "Line data (JSON)" and says "Exported \'Twelve on Foot — Chapter 1: Fog Bell\'."; in The Keeper\'s Logbook the "Knots" tab lists "quiz › question_1".',
  evidence: [
    "Line data (JSON)",
    "Exported 'Twelve on Foot — Chapter 1: Fog Bell'.",
    "Knots",
    "quiz › question_1",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
