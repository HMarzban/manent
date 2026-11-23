import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_NOTE: TourScenario = {
  id: "together-note",
  group: "Work together",
  promise: "Address a note and watch the count go down.",
  setup: setupOf({
    userId: "dana",
    open: docPath("medium/harbour-lights/203"),
  }),
  steps: [
    { text: "Open item 5 of the Network round.", highlight: "page" },
    { text: "Resolve it as Addressed.", highlight: "page" },
  ],
  check:
    'The note is resolved as "Addressed", and the count of open notes goes from 4 to 3.',
  evidence: ["Addressed"],
  fresh: false,
  waitsFor: "rounds",
  hidden: null,
};
