import type { TourScenario } from "../../format.ts";
import { EKBO } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_READ_ALOUD: TourScenario = {
  id: "write-read-aloud",
  group: "Write",
  promise: "Hear the script read aloud, with a voice for each character.",
  setup: setupOf({ userId: "sam", open: EKBO }),
  steps: [
    {
      text: "Put the caret in scene 14.",
      highlight: "page",
    },
    {
      text: "Choose Read aloud in the Script menu: the caret follows each line as it is read.",
      highlight: "readAloud.start",
    },
    {
      text: "Choose Stop in the state bar.",
      highlight: "readAloud.stop",
    },
  ],
  check:
    'The state bar reads "Reading aloud" with "Stop" while the script is read from scene 14, and Stop ends it.',
  evidence: ["Reading aloud", "Stop"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
