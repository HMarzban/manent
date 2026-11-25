import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_OUTLINE: TourScenario = {
  id: "write-outline",
  group: "Write",
  promise: "Turn an outline into scene headings in one step.",
  setup: setupOf(
    {
      userId: "dana",
      open: docPath("medium/harbour-lights/206"),
    },
    [],
    "write-outline-ready",
  ),
  steps: [
    {
      text: "Choose Open beside in the title menu, then Outline.",
      highlight: "doc.openBeside",
    },
    {
      text: "Choose Start script from outline in the state bar.",
      highlight: "outline.startScript",
    },
    {
      text: "Open the Scenes tab.",
      highlight: "tab:scenes",
    },
  ],
  check:
    'The state bar read "This script\'s outline has 31 beats"; afterwards the message reads "Started the script from its outline: 31 scene headings."',
  evidence: [
    "This script's outline has 31 beats",
    "Started the script from its outline: 31 scene headings.",
  ],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
