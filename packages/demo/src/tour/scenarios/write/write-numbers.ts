import type { TourScenario } from "../../format.ts";
import { EKBO } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_NUMBERS: TourScenario = {
  id: "write-numbers",
  group: "Write",
  promise:
    "See a script's numbers, and export its character, scene and location reports.",
  setup: setupOf({ userId: "sam", open: EKBO }),
  steps: [
    {
      text: "Click the page readout: Details opens at Script, with Numbers.",
      highlight: "status:page",
    },
    {
      text: "Read the pages, scenes, estimated runtime and dialogue by character.",
      highlight: "details:numbers",
    },
    {
      text: "Choose Reports… in the Script menu.",
      highlight: "script.reports",
    },
  ],
  check:
    'Numbers reads "Estimated runtime" "1:39:00" for 99 pages, and Export opens with "Character report (CSV)" chosen.',
  evidence: ["Estimated runtime", "1:39:00", "Character report (CSV)"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
