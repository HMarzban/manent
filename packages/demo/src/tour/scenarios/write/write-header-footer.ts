import type { TourScenario } from "../../format.ts";
import { LAMP_ROOM } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_HEADER_FOOTER: TourScenario = {
  id: "write-header-footer",
  group: "Write",
  promise:
    "Put the title and the page count in the header, and the PDF shows them exactly as the page does.",
  setup: setupOf(
    { userId: "sam", open: LAMP_ROOM },
    [],
    "write-header-footer-ready",
  ),
  steps: [
    {
      text: "Open Script settings and choose Header.",
      highlight: "doc.scriptSettings",
    },
    {
      text: "Choose Custom, then set Centre to Title and Right to Page of total.",
      highlight: "setting:script.header",
    },
    {
      text: "Choose Export… and compare page 2 with the page on screen.",
      highlight: "doc.export",
    },
  ],
  check:
    'The message reads "Header is now Custom.", and page 2 shows "2 of 12" at the right, on screen and in Export\'s pages alike.',
  evidence: ["Header is now Custom.", "2 of 12"],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
