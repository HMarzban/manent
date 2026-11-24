import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_ALTERNATES: TourScenario = {
  id: "write-alternates",
  group: "Write",
  promise: "Keep other ways to say a line, and cuts you may want back.",
  setup: setupOf(
    {
      userId: "sam",
      open: docPath("medium/the-late-desk/monologue"),
    },
    [],
    "write-alternates-ready",
  ),
  steps: [
    {
      text: "Put the caret in the traffic joke and choose Alternates.",
      highlight: "alternate.show",
    },
    {
      text: 'Pick "Engineers call it ambitious. Cyclists call it overdue." and choose Use this.',
      highlight: "alternates",
    },
    {
      text: "Open the Cuts tab and choose Restore on the night market joke.",
      highlight: "tab:cuts",
    },
  ],
  check:
    'The marker reads "1/3"; the message reads "Swapped in Dana\'s alternate.", and Restore says "Restored 2 elements from cuts."',
  evidence: [
    "1/3",
    "Swapped in Dana's alternate.",
    "Restored 2 elements from cuts.",
  ],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
