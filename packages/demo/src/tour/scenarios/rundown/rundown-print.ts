import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_PRINT: TourScenario = {
  id: "rundown-print",
  group: "Rundown and prompter",
  promise: "Print a rundown, all its scripts as one, and its brackets.",
  setup: setupOf({
    userId: "ana",
    open: docPath("medium/lannick-one-news/rundowns/day"),
  }),
  steps: [
    {
      text: "Choose Export… in the title menu.",
      highlight: "doc.export",
    },
    {
      text: "Under As, tick All scripts as one PDF and Brackets list beside Rundown PDF.",
      highlight: "send:as",
    },
    {
      text: "Choose Export 3 files.",
      highlight: "send:confirm",
    },
  ],
  check:
    'As lists "Rundown PDF", "All scripts as one PDF" and "Brackets list", the button reads "Export 3 files", and three files download.',
  evidence: [
    "Rundown PDF",
    "All scripts as one PDF",
    "Brackets list",
    "Export 3 files",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
