import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_MANUSCRIPT: TourScenario = {
  id: "write-manuscript",
  group: "Write",
  promise:
    "Write a book: chapters, first-line indents, each chapter on a new page.",
  setup: setupOf({ userId: "sam", open: docPath("small/jumpox/manuscript") }),
  steps: [
    { text: "Choose Left panel in View.", highlight: "view.leftPanel" },
    {
      text: "In a book the Scenes tab reads Chapters; choose one to go to it.",
      highlight: "tab:scenes",
    },
  ],
  check:
    'The tab reads "Chapters" and lists "Chapter One: The Box Nobody Wanted" first.',
  evidence: ["Chapters", "Chapter One: The Box Nobody Wanted"],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
