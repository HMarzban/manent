import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_ADAPT: TourScenario = {
  id: "write-adapt",
  group: "Write",
  promise: "Adapt a book as a stage play, with the book open beside it.",
  setup: setupOf({
    userId: "sam",
    open: docPath("small/down-the-back/script"),
  }),
  steps: [
    {
      text: "Open Jumpox — Spark & Looki beside the play.",
      highlight: "page",
    },
    { text: "Move the caret to Act One, scene 4.", highlight: "page" },
  ],
  check:
    'Chapter 6 of the book opens beside the play when the caret reaches "Mrs. Lomax\'s Spectacles".',
  evidence: ["Mrs. Lomax's Spectacles"],
  fresh: false,
  waitsFor: "start_from",
  hidden: null,
};
