import { docPath } from "../../../seed/catalogue.ts";
import type { TourScenario } from "../../format.ts";
import { setupOf } from "../setup.ts";

export const WRITE_BOOK_PUBLISHING: TourScenario = {
  id: "write-book-publishing",
  group: "Write",
  promise:
    "Lay out a book with serif typography, book sizes, left and right margins, footnotes, facing spreads and EPUB or Markdown export.",
  setup: setupOf({
    userId: "dana",
    open: docPath("medium/the-salt-almanac/manuscript"),
  }),
  steps: [
    {
      text: "Open Page layout in the Book format bar and switch Book layout on for Source Serif 4, book sizes and left and right margins.",
      highlight: "page",
    },
    {
      text: "Open Details and expand Footnotes to review and jump to notes across the book.",
      highlight: "details:footnotes",
    },
    {
      text: "Choose Export from the title menu to inspect Spread view and export as Clean PDF, Word, EPUB or Markdown.",
      highlight: "send:as",
    },
  ],
  check:
    "The manuscript reflows in Source Serif 4 with Spread view and offers Clean PDF, Word (.docx), EPUB (.epub) and Markdown (.md).",
  evidence: ["Spread", "EPUB (.epub)", "Markdown (.md)"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
