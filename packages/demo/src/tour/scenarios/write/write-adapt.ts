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
      text: "Choose Open beside in the title menu, then Jumpox — Spark & Looki.",
      highlight: "doc.openBeside",
    },
    {
      text: "Put the caret in Act One, scene 4, Mrs. Lomax's Spectacles.",
      highlight: "page",
    },
    {
      text: "The book beside it turns to that scene's chapter.",
      highlight: "beside",
    },
  ],
  check:
    'Beside reads "Read-only here — open it to edit" and shows "Chapter Six: Mrs. Lomax\'s Spectacles".',
  evidence: [
    "Read-only here — open it to edit",
    "Chapter Six: Mrs. Lomax's Spectacles",
  ],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
