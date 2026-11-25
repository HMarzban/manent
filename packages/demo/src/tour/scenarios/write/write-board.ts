import type { TourScenario } from "../../format.ts";
import { projectPath } from "../paths.ts";
import { setupOf } from "../setup.ts";

export const WRITE_BOARD: TourScenario = {
  id: "write-board",
  group: "Write",
  promise:
    "Lay out a season on the Board, and every card opens the scene it stands for.",
  setup: setupOf({
    userId: "dana",
    open: projectPath("medium/harbour-lights", "board"),
  }),
  steps: [
    {
      text: "In the Finn storyline, choose Add card under 204 and type: Finn hides in the bread van.",
      highlight: "board.addCard",
    },
    {
      text: "With the card selected, choose Link to scene and pick scene 11.",
      highlight: "board.linkScene",
    },
    {
      text: "Press Alt+Up to move the card to the top of its cell.",
      highlight: "board",
    },
    {
      text: "Open the card.",
      highlight: "board",
    },
  ],
  check:
    'The card reads "204 · sc. 11", and opening it puts the caret in 204 with the scene readout at "Scene 11".',
  evidence: ["204 · sc. 11", "Scene 11"],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
