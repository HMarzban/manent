import type { TourScenario } from "../../format.ts";
import { EKBO } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_EXPORT: TourScenario = {
  id: "write-export",
  group: "Write",
  promise: "Export a PDF whose pages are the pages on screen.",
  setup: setupOf({ userId: "sam", open: EKBO }),
  steps: [
    { text: "Choose Export… in the title menu.", highlight: "doc.export" },
    { text: "Choose Export 1 file.", highlight: "send:confirm" },
  ],
  check:
    "The PDF downloads with the screen's 99 pages, and the message reads \"Exported 'Every Key But One'.\"",
  evidence: ["Exported 'Every Key But One'."],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
