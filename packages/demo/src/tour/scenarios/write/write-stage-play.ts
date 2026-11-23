import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_STAGE_PLAY: TourScenario = {
  id: "write-stage-play",
  group: "Write",
  promise:
    "Write a play: centred scenes, and stage directions whose brackets you never type.",
  setup: setupOf({
    userId: "sam",
    open: docPath("small/down-the-back/script"),
  }),
  steps: [
    {
      text: "Choose Left panel in View: the play's scenes are listed.",
      highlight: "view.leftPanel",
    },
    {
      text: "At the end of Scene 2 press Enter and type a stage direction, with no brackets.",
      highlight: "page",
    },
  ],
  check:
    'The layout draws the brackets; the list holds "Scene 1: Mallow Street" and "Scene 2: The Box" under "ACT ONE".',
  evidence: ["ACT ONE", "Scene 1: Mallow Street", "Scene 2: The Box"],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
