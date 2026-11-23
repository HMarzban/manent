import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_OUTLINE: TourScenario = {
  id: "write-outline",
  group: "Write",
  promise: "Turn an outline into scene headings in one step.",
  setup: setupOf({
    userId: "dana",
    open: docPath("medium/harbour-lights/206"),
  }),
  steps: [
    { text: "Open the outline beside the script.", highlight: "page" },
    { text: "Choose Start script from outline.", highlight: "page" },
  ],
  check:
    '"Start script from outline" makes 31 scene headings, each with its synopsis.',
  evidence: ["Start script from outline"],
  fresh: false,
  waitsFor: "outline_to_script",
  hidden: null,
};
