import type { TourScenario } from "../../format.ts";
import { EKBO } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_FORMAT_SWITCH: TourScenario = {
  id: "write-format-switch",
  group: "Write",
  promise: "Change a script's format and every word stays as it was.",
  setup: setupOf({ userId: "sam", open: EKBO }, [], "ekbo-screenplay"),
  steps: [
    { text: "Open Script settings.", highlight: "doc.scriptSettings" },
    {
      text: "Set Format to Multi-camera: the pages take its layout.",
      highlight: "setting:script.format",
    },
    {
      text: "Set Format back to Screenplay.",
      highlight: "setting:script.format",
    },
  ],
  check:
    'Format reads "Multi-camera", then "Screenplay"; the text is unchanged.',
  evidence: ["Multi-camera", "Screenplay"],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
