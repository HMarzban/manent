import type { TourScenario } from "../../format.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_TIME: TourScenario = {
  id: "rundown-time",
  group: "Rundown and prompter",
  promise: "Time a show to the second, and see it run over.",
  setup: setupOf({ userId: "ana", open: "/" }),
  steps: [
    {
      text: "Open today's rundown of The Late Desk: it runs over by 0:48, and Ana's comment is on row 5.",
      highlight: "page",
    },
    { text: "Cut a letter from Benny's Mailbag.", highlight: "page" },
  ],
  check: 'Dur, Cume, Start, Back and "Over" update as the letter is cut.',
  evidence: ["Over"],
  fresh: false,
  waitsFor: "rundowns",
  hidden: null,
};
